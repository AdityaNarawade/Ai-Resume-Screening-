
import mysql.connector
from mysql.connector import Error


def get_connection():

    try:

        connection = mysql.connector.connect(
    host="127.0.0.1",
    user="root",
    password="Aditya@3120",
    database="talentrank_db",
    port=3306
)

        

        return connection

    except Error as error:

        print("MySQL Connection Error:", error)

        return None