
import os
import re
import io
import csv

import pymupdf
from flask import Flask, render_template, request, jsonify, send_file
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from db import get_connection
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static")
)

# app.config["MAX_CONTENT_LENGTH"] = 30 * 1024 * 1024
UPLOAD_FOLDER = os.path.join(BASE_DIR, "resumes")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
# Supported skills
SKILLS = [
    "Python", "SQL", "Excel", "Power BI", "Tableau",
    "Machine Learning", "Statistics", "Pandas", "NumPy",
    "Matplotlib", "Seaborn", "Data Analysis",
    "Data Visualization", "MySQL", "PostgreSQL",
    "Java", "C++", "HTML", "CSS", "JavaScript",
    "Deep Learning", "NLP", "Communication",
    "Problem Solving", "Flask", "Django",
    "ETL", "Data Cleaning", "Microsoft Excel",
    "Business Analysis"
]

screening_results = []


# Extract text from PDF
def extract_pdf_text(file):
    pdf_data = file.read()

    with pymupdf.open(
        stream=pdf_data,
        filetype="pdf"
    ) as document:

        text = ""

        for page in document:
            text += page.get_text()

    return text


# Extract email
def extract_email(text):
    match = re.search(
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b',
        text
    )

    return match.group(0) if match else "Not found"


# Extract skills
def extract_skills(text):
    found = []

    for skill in SKILLS:

        pattern = r'(?<!\w)' + re.escape(skill) + r'(?!\w)'

        if re.search(pattern, text, re.IGNORECASE):
            found.append(skill)

    return found


# Calculate NLP similarity
def similarity_score(resume_text, job_text):

    try:
        vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2)
        )

        matrix = vectorizer.fit_transform([
            resume_text,
            job_text
        ])

        score = cosine_similarity(
            matrix[0:1],
            matrix[1:2]
        )[0][0]

        return round(score * 100, 1)

    except ValueError:
        return 0.0


# Home page
@app.route("/")
def home():
    return render_template("index.html")

def save_screening_to_database(
    job_description,
    results,
    uploaded_data
):

    connection = get_connection()

    if connection is None:
        raise Exception("Unable to connect to MySQL database.")

    cursor = connection.cursor()

    try:

        # Save job description
        cursor.execute("""
            INSERT INTO jobs (job_description)
            VALUES (%s)
        """, (job_description,))

        job_id = cursor.lastrowid

        # Save each candidate
        for candidate in results:

            original_file = candidate["name"]

            # Find the corresponding uploaded file data
            resume_data = uploaded_data[original_file]

            email = candidate["email"]

            # Candidate name from filename
            candidate_name = os.path.splitext(
                original_file
            )[0]

            cursor.execute("""
                INSERT INTO candidates
                (candidate_name, email)
                VALUES (%s, %s)
            """, (
                candidate_name,
                email if email != "Not found" else None
            ))

            candidate_id = cursor.lastrowid

            # Save resume file
            safe_filename = secure_filename(original_file)

            unique_filename = (
                f"{job_id}_{candidate_id}_{safe_filename}"
            )

            file_path = os.path.join(
                app.config["UPLOAD_FOLDER"],
                unique_filename
            )

            with open(file_path, "wb") as resume_file:

                resume_file.write(resume_data["file_bytes"])

            # Save resume information
            cursor.execute("""
                INSERT INTO resumes
                (
                    candidate_id,
                    job_id,
                    file_name,
                    file_path,
                    extracted_text
                )
                VALUES (%s, %s, %s, %s, %s)
            """, (
                candidate_id,
                job_id,
                original_file,
                file_path,
                resume_data["text"]
            ))

            resume_id = cursor.lastrowid

            # Save scores
            cursor.execute("""
                INSERT INTO screening_results
                (
                    candidate_id,
                    job_id,
                    resume_id,
                    skill_score,
                    text_score,
                    final_score,
                    candidate_rank
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                candidate_id,
                job_id,
                resume_id,
                candidate["skill_score"],
                candidate["text_score"],
                candidate["final_score"],
                candidate["rank"]
            ))

            # Save candidate skills
            for skill in candidate["skills"]:

                cursor.execute("""
                    INSERT INTO candidate_skills
                    (
                        candidate_id,
                        resume_id,
                        skill_name,
                        is_matched
                    )
                    VALUES (%s, %s, %s, %s)
                """, (
                    candidate_id,
                    resume_id,
                    skill,
                    skill in candidate["matched"]
                ))

        connection.commit()

        return job_id

    except Exception as error:

        connection.rollback()

        raise error

    finally:

        cursor.close()

        connection.close()

# Resume screening

@app.route("/screen", methods=["POST"])
def screen():

    global screening_results

    job_description = request.form.get(
        "job_description", ""
    ).strip()

    uploaded_files = request.files.getlist("resumes")

    if not job_description:
        return jsonify({
            "error": "Please enter a job description."
        }), 400

    if not any(f.filename for f in uploaded_files):
        return jsonify({
            "error": "Please upload PDF resumes."
        }), 400

    job_skills = extract_skills(job_description)

    if not job_skills:
        return jsonify({
            "error": "No supported skills found in job description."
        }), 400

    screening_results = []

    uploaded_data = {}

    for file in uploaded_files:

        if not file.filename:
            continue

        if not file.filename.lower().endswith(".pdf"):
            continue

        try:

            # Read file bytes once
            file_bytes = file.read()

            # Extract PDF text
            resume_text = extract_pdf_text(
                io.BytesIO(file_bytes)
            )

            if not resume_text.strip():
                continue

            candidate_skills = extract_skills(
                resume_text
            )

            matched_skills = [
                skill for skill in job_skills
                if skill in candidate_skills
            ]

            missing_skills = [
                skill for skill in job_skills
                if skill not in candidate_skills
            ]

            skill_score = (
                len(matched_skills) / len(job_skills)
            ) * 100

            text_score = similarity_score(
                resume_text,
                job_description
            )

            final_score = (
                0.60 * skill_score +
                0.40 * text_score
            )

            filename = file.filename

            screening_results.append({

                "name": filename,

                "email": extract_email(resume_text),

                "skills": candidate_skills,

                "matched": matched_skills,

                "missing": missing_skills,

                "skill_score": round(skill_score, 1),

                "text_score": round(text_score, 1),

                "final_score": round(final_score, 1)

            })

            uploaded_data[filename] = {

                "file_bytes": file_bytes,

                "text": resume_text

            }

        except Exception as error:

            print("PDF processing error:", error)

            continue

    if not screening_results:

        return jsonify({
            "error": "No readable PDF resumes found."
        }), 400

    # Rank candidates
    screening_results.sort(
        key=lambda x: x["final_score"],
        reverse=True
    )

    for rank, candidate in enumerate(
        screening_results, 1
    ):

        candidate["rank"] = rank

    # Save results in MySQL
    try:

        job_id = save_screening_to_database(
            job_description,
            screening_results,
            uploaded_data
        )

    except Exception as error:

        print("Database saving error:", error)

        return jsonify({
            "error": "Screening completed, but database saving failed. Check MySQL connection and database tables.",
            "details": str(error)
        }), 500

    return jsonify({

        "results": screening_results,

        "total": len(screening_results),

        "job_skills": job_skills,

        "job_id": job_id,

        "message": "Screening results saved successfully."

    })


# Download CSV
@app.route("/download")
def download():

    output = io.StringIO()

    writer = csv.writer(output)

    writer.writerow([
        "Rank",
        "Resume",
        "Email",
        "Matched Skills",
        "Missing Skills",
        "Skill Score",
        "Text Similarity",
        "Final Score"
    ])

    for candidate in screening_results:

        writer.writerow([
            candidate["rank"],
            candidate["name"],
            candidate["email"],
            ", ".join(candidate["matched"]),
            ", ".join(candidate["missing"]),
            candidate["skill_score"],
            candidate["text_score"],
            candidate["final_score"]
        ])

    memory = io.BytesIO(
        output.getvalue().encode("utf-8-sig")
    )

    memory.seek(0)

    return send_file(
        memory,
        mimetype="text/csv",
        as_attachment=True,
        download_name="candidate_screening_results.csv"
    )





# File size error
@app.errorhandler(413)
def file_too_large(error):

    return jsonify({
        "error": "Total upload size must be below 30 MB."
    }), 413

@app.route("/history")
def screening_history():

    connection = get_connection()

    if connection is None:

        return jsonify({
            "error": "Database connection failed."
        }), 500

    cursor = connection.cursor(dictionary=True)

    try:

        cursor.execute("""
            SELECT
                sr.result_id,
                j.job_id,
                j.job_title,
                c.candidate_name,
                c.email,
                r.file_name,
                sr.skill_score,
                sr.text_score,
                sr.final_score,
                sr.candidate_rank,
                sr.screened_at

            FROM screening_results sr

            JOIN candidates c
                ON sr.candidate_id = c.candidate_id

            JOIN jobs j
                ON sr.job_id = j.job_id

            JOIN resumes r
                ON sr.resume_id = r.resume_id

            ORDER BY sr.screened_at DESC
        """)

        results = cursor.fetchall()

        for row in results:

            row["screened_at"] = str(
                row["screened_at"]
            )

        return jsonify(results)

    except Exception as error:

        return jsonify({
            "error": str(error)
        }), 500

    finally:

        cursor.close()

        connection.close()

if __name__ == "__main__":

    app.run(debug=True)