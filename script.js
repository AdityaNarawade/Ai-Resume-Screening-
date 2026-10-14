
const form = document.getElementById("screenForm");

const fileInput = document.getElementById("resumeFiles");

const fileCount = document.getElementById("fileCount");

const message = document.getElementById("message");

const table = document.getElementById("candidateTable");

const screenButton = document.getElementById("screenButton");

const searchInput = document.getElementById("candidateSearch");

let candidates = [];

let scoreChart = null;
let distributionChart = null;
let comparisonChart = null;
let skillChart = null;
let radarChart = null;


// STORE ALL UPLOADED RESUMES
let selectedFiles = [];


// ADD NEW RESUMES WITHOUT REMOVING OLD ONES
function addResumes(newFiles) {

    Array.from(newFiles).forEach(file => {

        if (file.type !== "application/pdf" &&
            !file.name.toLowerCase().endsWith(".pdf")) {

            showMessage(
                "Only PDF files are allowed.",
                true
            );

            return;
        }

        // Avoid duplicate files
        const exists = selectedFiles.some(existing =>

            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified

        );

        if (!exists) {
            selectedFiles.push(file);
        }

    });

    updateResumeList();

}


// UPDATE FILE INPUT WITH ALL RESUMES
function syncFileInput() {

    const dataTransfer = new DataTransfer();

    selectedFiles.forEach(file => {

        dataTransfer.items.add(file);

    });

    fileInput.files = dataTransfer.files;

}

function openHelp() {
    document.getElementById("helpModal").style.display = "flex";
}

function closeHelp() {
    document.getElementById("helpModal").style.display = "none";
}



// DISPLAY ALL UPLOADED RESUMES
function updateResumeList() {

    const uploadedList =
        document.getElementById("uploadedList");

    const resumeItems =
        document.getElementById("resumeItems");

    const uploadedTotal =
        document.getElementById("uploadedTotal");

    fileCount.textContent =
        `${selectedFiles.length} PDF file(s) selected`;

    document.getElementById("totalResumes").textContent =
        selectedFiles.length;

    uploadedTotal.textContent =
        `${selectedFiles.length} files`;

    uploadedList.style.display =
        selectedFiles.length ? "block" : "none";

    resumeItems.innerHTML = selectedFiles.map(
        (file, index) => `

        <div class="resume-item">

            <div class="resume-info">

                <div class="pdf-icon">
                    PDF
                </div>

                <div class="resume-details">

                    <b title="${safeText(file.name)}">
                        ${safeText(file.name)}
                    </b>

                    <small>
                        ${(file.size / 1024).toFixed(1)} KB
                        · Ready for screening
                    </small>

                </div>

            </div>

            <button
                type="button"
                class="remove-resume"
                onclick="removeResume(${index})">

                ✕

            </button>

        </div>

    `).join("");

    // Keep all files inside input
    syncFileInput();

}


// REMOVE INDIVIDUAL RESUME
function removeResume(index) {

    selectedFiles.splice(index, 1);

    updateResumeList();

}


// FILE SELECTION
fileInput.addEventListener("change", () => {

    addResumes(fileInput.files);

});


// DRAG AND DROP
const dropzone = document.getElementById("dropzone");

["dragenter", "dragover"].forEach(eventName => {

    dropzone.addEventListener(eventName, event => {

        event.preventDefault();

        dropzone.classList.add("dragging");

    });

});


["dragleave", "drop"].forEach(eventName => {

    dropzone.addEventListener(eventName, event => {

        event.preventDefault();

        dropzone.classList.remove("dragging");

    });

});


dropzone.addEventListener("drop", event => {

    addResumes(event.dataTransfer.files);

});


// SCREENING FORM
form.addEventListener("submit", async event => {

    event.preventDefault();

    if (!fileInput.files.length) {

        showMessage(
            "Please choose at least one PDF resume.",
            true
        );

        return;

    }

    screenButton.disabled = true;

    screenButton.textContent = "Analyzing resumes...";

    showMessage(
        "Extracting resume text and calculating scores...",
        false
    );

    table.innerHTML = `
        <tr>
            <td colspan="6">
                <div class="empty-state">
                    Screening in progress...
                </div>
            </td>
        </tr>
    `;

    try {

        const formData = new FormData();

formData.append(
    "job_description",
    document.getElementById("jobDescription").value
);

// Send ALL selected resumes
selectedFiles.forEach(file => {

    formData.append("resumes", file);

});

const response = await fetch("/screen", {

    method: "POST",

    body: formData

});

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.error || "Screening failed."
            );

        }

        candidates = data.results || [];

        renderCandidates(candidates);

updateStats(candidates);

renderAnalytics(
    candidates,
    data.job_skills || []
);

        showMessage(
            `Screening complete: ${data.total} readable resume(s) analyzed.`,
            false,
            true
        );

    } catch (error) {

        showMessage(error.message, true);

        table.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        No results to display.
                        Check the error message and try again.
                    </div>
                </td>
            </tr>
        `;

    } finally {

        screenButton.disabled = false;

        screenButton.innerHTML =
            "✦ Run AI Screening →";

    }

});


// DISPLAY MESSAGE
function showMessage(text, error, success = false) {

    message.textContent = text;

    message.style.color = error
        ? "#c34f55"
        : success
            ? "#21865f"
            : "#74839a";

}


// SAFE HTML TEXT
function safeText(value) {

    return String(value ?? "").replace(
        /[&<>"']/g,

        character => ({

            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"

        })[character]

    );

}


// DISPLAY CANDIDATES
function renderCandidates(list) {

    const query = searchInput.value
        .trim()
        .toLowerCase();

    const filtered = list.filter(candidate => {

        const searchable = `

            ${candidate.name}

            ${candidate.email}

            ${(candidate.matched || []).join(" ")}

        `.toLowerCase();

        return searchable.includes(query);

    });

    document.getElementById("resultCount").textContent =
        `${filtered.length} candidate(s)`;

    document.getElementById("tableFooterText").textContent =
        `Showing ${filtered.length} of ${list.length} screened candidates`;

    if (!filtered.length) {

        table.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <b>No matching candidates</b>
                        <p>Try a different search term.</p>
                    </div>
                </td>
            </tr>
        `;

        return;

    }

    table.innerHTML = filtered.map(candidate => {

        const tags = (candidate.matched || [])
            .slice(0, 3)
            .map(skill => `
                <span class="skill-tag">
                    ${safeText(skill)}
                </span>
            `)
            .join("");

        const extra = candidate.matched.length > 3
            ? `
                <span class="skill-tag more">
                    +${candidate.matched.length - 3}
                </span>
              `
            : "";

        return `

            <tr>

                <td>
                    <span class="rank-badge ${
                        candidate.rank === 1 ? "first" : ""
                    }">

                        ${candidate.rank}

                    </span>
                </td>


                <td>

                    <div class="candidate-cell">

                        <span class="candidate-avatar">

                            ${safeText(
                                candidate.name.charAt(0).toUpperCase()
                            )}

                        </span>

                        <div>

                            <b title="${safeText(candidate.name)}">

                                ${safeText(candidate.name)}

                            </b>

                            <small>
                                ${safeText(candidate.email)}
                            </small>

                        </div>

                    </div>

                </td>


                <td>

                    <b class="score-number">
                        ${candidate.skill_score}%
                    </b>

                    <div class="bar-line">

                        <i style="width:${
                            candidate.skill_score
                        }%"></i>

                    </div>

                </td>


                <td>
                    ${candidate.text_score}%
                </td>


                <td>

                    <b class="score-number">
                        ${candidate.final_score}%
                    </b>

                </td>


                <td>

                    <div class="skill-tags">

                        ${tags || '<span class="skill-tag">No matched skills</span>'}

                        ${extra}

                    </div>

                </td>

            </tr>

        `;

    }).join("");

}


// UPDATE KPI CARDS
function updateStats(list) {

    document.getElementById("screened").textContent =
        list.length;

    const average = list.length
        ? list.reduce(
            (sum, candidate) => sum + candidate.final_score,
            0
        ) / list.length
        : 0;

    document.getElementById("averageMatch").textContent =
        `${average.toFixed(1)}%`;

    document.getElementById("topMatch").textContent =
        list.length
            ? `${list[0].final_score}%`
            : "—";

}



// ======================================
// DESTROY OLD CHARTS
// ======================================

function destroyChart(chart) {

    if (chart) {
        chart.destroy();
    }

}


// ======================================
// COMMON CHART OPTIONS
// ======================================

const chartFont = {
    family: "DM Sans",
    size: 11
};

const chartColors = [
    "#3769d7",
    "#9276db",
    "#efa94c",
    "#cbd2dd"
];


// ======================================
// MAIN ANALYTICS FUNCTION
// ======================================

function renderAnalytics(list, jobSkills) {

    renderDistributionChart(list);

    renderComparisonChart(list);

    renderSkillChart(list, jobSkills);

    renderRadarChart(list, jobSkills);

    updateAnalyticsSummary(list, jobSkills);

}


// ======================================
// 1. DOUGHNUT CHART
// CANDIDATE SCORE DISTRIBUTION
// ======================================

function renderDistributionChart(list) {

    destroyChart(distributionChart);

    const canvas = document.getElementById(
        "distributionChart"
    );

    const ranges = [
        { label: "80–100%", min: 80, max: 100 },
        { label: "60–79%", min: 60, max: 80 },
        { label: "40–59%", min: 40, max: 60 },
        { label: "0–39%", min: 0, max: 40 }
    ];

    const values = ranges.map(range => {

        return list.filter(candidate => {

            const score = candidate.final_score;

            return score >= range.min &&
                   score < range.max;

        }).length;

    });

    distributionChart = new Chart(canvas, {

        type: "doughnut",

        data: {

            labels: ranges.map(range => range.label),

            datasets: [{

                data: values,

                backgroundColor: chartColors,

                borderWidth: 3,

                borderColor: "#ffffff",

                hoverOffset: 8

            }]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            cutout: "68%",

            plugins: {

                legend: {
                    display: false
                },

                tooltip: {
                    callbacks: {

                        label: function(context) {

                            return `${context.label}: ${context.raw} candidates`;

                        }

                    }
                }

            }

        }

    });

}


// ======================================
// 2. BAR CHART
// CANDIDATE SCORE COMPARISON
// ======================================

function renderComparisonChart(list) {

    destroyChart(comparisonChart);

    const canvas = document.getElementById(
        "comparisonChart"
    );

    const topCandidates = list.slice(0, 10);

    comparisonChart = new Chart(canvas, {

        type: "bar",

        data: {

            labels: topCandidates.map(candidate => {

                return candidate.name.length > 15
                    ? candidate.name.slice(0, 12) + "..."
                    : candidate.name;

            }),

            datasets: [

                {

                    label: "Skill Match",

                    data: topCandidates.map(
                        candidate => candidate.skill_score
                    ),

                    backgroundColor: "#3769d7",

                    borderRadius: 5

                },

                {

                    label: "Text Similarity",

                    data: topCandidates.map(
                        candidate => candidate.text_score
                    ),

                    backgroundColor: "#9276db",

                    borderRadius: 5

                }

            ]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            plugins: {

                legend: {

                    position: "bottom",

                    labels: {
                        font: chartFont,
                        usePointStyle: true,
                        boxWidth: 8
                    }

                }

            },

            scales: {

                y: {

                    beginAtZero: true,

                    max: 100,

                    ticks: {
                        callback: value => value + "%"
                    }

                }

            }

        }

    });

}


// ======================================
// 3. HORIZONTAL BAR CHART
// SKILL MATCH ANALYSIS
// ======================================

function renderSkillChart(list, jobSkills) {

    destroyChart(skillChart);

    const canvas = document.getElementById(
        "skillChart"
    );

    const counts = jobSkills.map(skill => {

        return list.filter(candidate => {

            return candidate.matched.includes(skill);

        }).length;

    });

    skillChart = new Chart(canvas, {

        type: "bar",

        data: {

            labels: jobSkills,

            datasets: [{

                label: "Candidates with skill",

                data: counts,

                backgroundColor: "#5481df",

                borderRadius: 5,

                barThickness: 15

            }]

        },

        options: {

            indexAxis: "y",

            responsive: true,

            maintainAspectRatio: false,

            plugins: {

                legend: {
                    display: false
                }

            },

            scales: {

                x: {

                    beginAtZero: true,

                    ticks: {
                        precision: 0
                    }

                },

                y: {

                    ticks: {
                        font: chartFont
                    }

                }

            }

        }

    });

}


// ======================================
// 4. RADAR CHART
// OVERALL SKILL COVERAGE
// ======================================

function renderRadarChart(list, jobSkills) {

    destroyChart(radarChart);

    const canvas = document.getElementById(
        "radarChart"
    );

    // Display up to 8 required skills
    const selectedSkills = jobSkills.slice(0, 8);

    const percentages = selectedSkills.map(skill => {

        if (!list.length) {
            return 0;
        }

        const matchedCount = list.filter(candidate => {

            return candidate.matched.includes(skill);

        }).length;

        return Math.round(
            (matchedCount / list.length) * 100
        );

    });

    radarChart = new Chart(canvas, {

        type: "radar",

        data: {

            labels: selectedSkills,

            datasets: [{

                label: "Skill Coverage",

                data: percentages,

                backgroundColor: "rgba(55, 105, 215, 0.15)",

                borderColor: "#3769d7",

                pointBackgroundColor: "#3769d7",

                pointBorderColor: "#ffffff",

                pointRadius: 4,

                borderWidth: 2

            }]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            plugins: {

                legend: {

                    position: "bottom",

                    labels: {
                        font: chartFont,
                        usePointStyle: true
                    }

                }

            },

            scales: {

                r: {

                    beginAtZero: true,

                    min: 0,

                    max: 100,

                    ticks: {
                        stepSize: 20,
                        backdropColor: "transparent"
                    },

                    pointLabels: {
                        font: chartFont
                    }

                }

            }

        }

    });

}


// ======================================
// ANALYTICS SUMMARY
// ======================================

function updateAnalyticsSummary(list, jobSkills) {

    const total = list.length;

    const average = total

        ? list.reduce(
            (sum, candidate) =>
                sum + candidate.final_score,
            0
        ) / total

        : 0;

    const topScore = total
        ? list[0].final_score
        : 0;

    document.getElementById(
        "analyticsTotal"
    ).textContent = total;

    document.getElementById(
        "analyticsAverage"
    ).textContent = average.toFixed(1) + "%";

    document.getElementById(
        "analyticsSkills"
    ).textContent = jobSkills.length;

    document.getElementById(
        "analyticsTop"
    ).textContent = topScore + "%";

}


// SEARCH CANDIDATES
searchInput.addEventListener("input", () => {

    renderCandidates(candidates);

});