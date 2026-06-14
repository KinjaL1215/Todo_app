import os
import sqlite3
import smtplib
import time
import threading
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import Flask, render_template, request, jsonify, redirect, url_for
from dotenv import load_dotenv
# Load environment variables
load_dotenv()
app = Flask(__name__)
# SMTP Email Configuration
sender_email = os.environ.get('SMTP_EMAIL', 'Your mail id')
sender_password = os.environ.get('SMTP_PASSWORD', 'Your app password')
smtp_server = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
smtp_port = int(os.environ.get('SMTP_PORT', 587))
def init_db():
    """Initializes the SQLite database table if it doesn't exist."""
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            email TEXT,
            reminder_time TEXT,
            completed INTEGER DEFAULT 0,
            reminder_sent INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def normalize_reminder_time(reminder_time):
    """Normalize reminder time to YYYY-MM-DD HH:MM format."""
    if not reminder_time:
        return None

    reminder_time = reminder_time.strip().replace('T', ' ')
    for fmt in (
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%d/%m/%Y %H:%M"
    ):
        try:
            parsed = datetime.strptime(reminder_time, fmt)
            return parsed.strftime("%Y-%m-%d %H:%M")
        except ValueError:
            continue

    return reminder_time

def send_email(to_email, subject, body):
    """Sends an email reminder using SMTP."""
    if not sender_email or sender_email == 'Your mail id' or not sender_password or sender_password == 'Your app password':
        print("Warning: Email credentials are not configured. Logging email reminder simulation:")
        print(f"  To: {to_email}\n  Subject: {subject}\n  Body: {body}\n")
        return True  # Return True to mark as simulated success
    try:
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(sender_email, sender_password)
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        server.sendmail(sender_email, to_email, msg.as_string())
        server.quit()
        print(f"Reminder email successfully sent to {to_email}")
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False
def check_and_send_reminders():
    """Background loop checking SQLite database for due reminders."""
    init_db()
    while True:
        try:
            now = datetime.now()
            conn = sqlite3.connect('tasks.db')
            cursor = conn.cursor()

            cursor.execute('''
                SELECT id, title, email, reminder_time FROM tasks
                WHERE completed = 0 AND reminder_sent = 0 AND reminder_time IS NOT NULL AND reminder_time != ""
            ''')
            rows = cursor.fetchall()

            for task_id, title, email, reminder_time in rows:
                if not email or not reminder_time:
                    continue

                try:
                    reminder_dt = datetime.strptime(reminder_time, "%Y-%m-%d %H:%M")
                except ValueError:
                    # Skip invalid reminder formats
                    continue

                if reminder_dt <= now:
                    print(f"Processing reminder for task '{title}' to {email} scheduled at {reminder_time}")
                    success = send_email(
                        email,
                        "Task Reminder",
                        f"Reminder: It's time to do your task: {title}\nScheduled time: {reminder_time}"
                    )
                    if success:
                        cursor.execute('UPDATE tasks SET reminder_sent = 1 WHERE id = ?', (task_id,))
                        conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error in background scheduler: {e}")
        time.sleep(10)  # Check every 10 seconds
# Flask API Routes
@app.route('/')
def index():
    return render_template('index.html')
@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    conn = sqlite3.connect('tasks.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM tasks ORDER BY created_at DESC')
    rows = cursor.fetchall()
    tasks_list = [dict(row) for row in rows]
    conn.close()
    return jsonify(tasks_list)
@app.route('/api/tasks', methods=['POST'])
def add_task():
    data = request.get_json() or {}
    title = data.get('title', '').strip()
    email = data.get('email', '').strip() or None
    reminder_time = normalize_reminder_time(data.get('reminder_time', ''))
    
    if not title:
        return jsonify({'error': 'Title is required'}), 400
        
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO tasks (title, email, reminder_time)
        VALUES (?, ?, ?)
    ''', (title, email, reminder_time))
    conn.commit()
    task_id = cursor.lastrowid
    conn.close()
    
    return jsonify({
        'id': task_id,
        'title': title,
        'email': email,
        'reminder_time': reminder_time,
        'completed': 0,
        'reminder_sent': 0
    })
@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    data = request.get_json() or {}
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    
    # Verify task exists
    cursor.execute('SELECT id FROM tasks WHERE id = ?', (task_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'Task not found'}), 404
        
    title = data.get('title')
    completed = data.get('completed')
    email = data.get('email')
    reminder_time = data.get('reminder_time')
    
    update_fields = []
    params = []
    
    if title is not None:
        update_fields.append("title = ?")
        params.append(title.strip())
    if completed is not None:
        update_fields.append("completed = ?")
        params.append(1 if completed else 0)
    if email is not None:
        update_fields.append("email = ?")
        params.append(email.strip() or None)
    if reminder_time is not None:
        normalized_time = normalize_reminder_time(reminder_time)
        update_fields.append("reminder_time = ?")
        params.append(normalized_time)
        update_fields.append("reminder_sent = 0")  # reset flag when reminder changes
        
    if not update_fields:
        conn.close()
        return jsonify({'error': 'No fields to update'}), 400
        
    params.append(task_id)
    query = f"UPDATE tasks SET {', '.join(update_fields)} WHERE id = ?"
    cursor.execute(query, tuple(params))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})
@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    
    cursor.execute('SELECT id FROM tasks WHERE id = ?', (task_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'Task not found'}), 404
        
    cursor.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})
if __name__ == '__main__':
    # Initialize the database
    init_db()
    
    # Start background scheduler thread
    threading.Thread(target=check_and_send_reminders, daemon=True).start()
    
    # Run the Flask server
    app.run(host='0.0.0.0', port=5000, debug=True)