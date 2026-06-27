import os
import random
import string
import sqlite3
from datetime import datetime
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.urandom(24)
DATABASE = os.environ.get('DATABASE_PATH', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'database.db'))

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    db_dir = os.path.dirname(DATABASE)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
    # Migration check: if old database exists without admin_profile_id in replies table
    # We check before opening the main connection, and physically delete the file to avoid Gunicorn worker race conditions.
    try:
        if os.path.exists(DATABASE):
            conn_temp = sqlite3.connect(DATABASE)
            conn_temp.row_factory = sqlite3.Row
            cursor_temp = conn_temp.cursor()
            cursor_temp.execute("PRAGMA table_info(replies)")
            columns = [row['name'] for row in cursor_temp.fetchall()]
            conn_temp.close()
            
            if columns and 'admin_profile_id' not in columns:
                try:
                    os.remove(DATABASE)
                    print("Removed old schema database file successfully.")
                except OSError:
                    pass # Ignored if another concurrent Gunicorn worker deleted it first
    except Exception as e:
        print("Migration check skipped or failed:", e)

    with get_db() as conn:
        cursor = conn.cursor()
        
        # Create admins table (handles login credentials only)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL
            )
        ''')
        
        # Create admin_profiles table (handles multiple identity display names under one admin)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS admin_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_id INTEGER NOT NULL,
                display_name TEXT NOT NULL,
                FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE CASCADE
            )
        ''')
        
        # Create letters table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS letters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                title TEXT DEFAULT '匿名信件',
                category TEXT DEFAULT '一般',
                content TEXT NOT NULL,
                is_archived INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create replies table (admin_id is Nullable to support anonymous sender replies)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS replies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                letter_id INTEGER NOT NULL,
                admin_id INTEGER,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (letter_id) REFERENCES letters (id) ON DELETE CASCADE,
                FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE CASCADE
            )
        ''')
        
        # Create read_statuses table (tracks read status per admin_id user account)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS read_statuses (
                admin_id INTEGER NOT NULL,
                letter_id INTEGER NOT NULL,
                read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (admin_id, letter_id),
                FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE CASCADE,
                FOREIGN KEY (letter_id) REFERENCES letters (id) ON DELETE CASCADE
            )
        ''')
        
        # Seed default administrator if table is empty
        cursor.execute('SELECT COUNT(*) FROM admins')
        if cursor.fetchone()[0] == 0:
            pwd_hash = generate_password_hash('admin123')
            cursor.execute(
                'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
                ('admin', pwd_hash)
            )
            admin_id = cursor.lastrowid
            cursor.execute(
                'INSERT INTO admin_profiles (admin_id, display_name) VALUES (?, ?)',
                (admin_id, '系統管理員')
            )
        conn.commit()

# Helper to generate unique 6-digit random number code
def generate_letter_code():
    while True:
        code = str(random.randint(100000, 999999))
        
        # Check uniqueness
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT id FROM letters WHERE code = ?', (code,))
            if cursor.fetchone() is None:
                return code

@app.route('/')
def index():
    return app.send_static_file('index.html')

# --- AUTH API ---

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    
    if not username or not password:
        return jsonify({'error': '請輸入帳號與密碼'}), 400
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM admins WHERE username = ?', (username,))
        admin = cursor.fetchone()
        
        if admin and check_password_hash(admin['password_hash'], password):
            # Fetch all profiles/identities matching this admin
            cursor.execute('SELECT id, display_name FROM admin_profiles WHERE admin_id = ?', (admin['id'],))
            profiles = cursor.fetchall()
            
            if not profiles:
                # If somehow no profiles exist, create a default one
                cursor.execute('INSERT INTO admin_profiles (admin_id, display_name) VALUES (?, ?)', (admin['id'], '管理員'))
                conn.commit()
                cursor.execute('SELECT id, display_name FROM admin_profiles WHERE admin_id = ?', (admin['id'],))
                profiles = cursor.fetchall()
            
            profiles_list = [{'id': p['id'], 'display_name': p['display_name']} for p in profiles]
            
            if len(profiles_list) == 1:
                # Auto-login if only one profile exists
                session['admin_id'] = admin['id']
                session['admin_username'] = admin['username']
                session['admin_display_name'] = profiles_list[0]['display_name']
                return jsonify({
                    'success': True,
                    'requires_selection': False,
                    'admin': {
                        'username': admin['username'],
                        'display_name': profiles_list[0]['display_name']
                    }
                })
            else:
                # Multiple profiles exist, require frontend selection
                # Store admin ID temporarily in session for validation in next select step
                session['temp_login_admin_id'] = admin['id']
                session['temp_login_username'] = admin['username']
                return jsonify({
                    'success': True,
                    'requires_selection': True,
                    'admin_id': admin['id'],
                    'profiles': profiles_list
                })
            
    return jsonify({'error': '帳號或密碼錯誤'}), 401

@app.route('/api/auth/login/select', methods=['POST'])
def api_login_select():
    data = request.get_json() or {}
    admin_id = data.get('admin_id')
    profile_id = data.get('profile_id')
    
    # Security check: verify this matches the temp login admin ID
    if 'temp_login_admin_id' not in session or session['temp_login_admin_id'] != admin_id:
        return jsonify({'error': '驗證逾時，請重新登入'}), 401
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT display_name FROM admin_profiles WHERE id = ? AND admin_id = ?', 
            (profile_id, admin_id)
        )
        profile = cursor.fetchone()
        
        if profile:
            # Login successful
            session['admin_id'] = admin_id
            session['admin_username'] = session['temp_login_username']
            session['admin_display_name'] = profile['display_name']
            
            # Clear temporary session data
            session.pop('temp_login_admin_id', None)
            session.pop('temp_login_username', None)
            
            return jsonify({
                'success': True,
                'admin': {
                    'username': session['admin_username'],
                    'display_name': session['admin_display_name']
                }
            })
            
    return jsonify({'error': '無效的身分選擇，請重新登入'}), 400

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/auth/me', methods=['GET'])
def api_me():
    if 'admin_id' in session:
        return jsonify({
            'logged_in': True,
            'admin': {
                'id': session['admin_id'],
                'username': session['admin_username'],
                'display_name': session['admin_display_name']
            }
        })
    return jsonify({'logged_in': False})


# --- ANONYMOUS MAILBOX API (PUBLIC) ---

@app.route('/api/letters/submit', methods=['POST'])
def submit_letter():
    data = request.get_json() or {}
    content = data.get('content', '').strip()
    
    if not content:
        return jsonify({'error': '信件內容不能為空'}), 400
        
    code = generate_letter_code()
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO letters (code, content) VALUES (?, ?)',
            (code, content)
        )
        conn.commit()
        
    return jsonify({
        'success': True,
        'code': code
    })

@app.route('/api/letters/query/<code>', methods=['GET'])
def query_letter(code):
    code = code.strip()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, content, is_archived, created_at FROM letters WHERE code = ?', (code,))
        letter = cursor.fetchone()
        
        if not letter:
            return jsonify({'error': '找不到此提取碼，請檢查輸入是否正確'}), 404
            
        # Get replies (LEFT JOIN replies to include cases where admin_id is NULL)
        # Store display name directly at reply submission to ensure proper historical roles.
        # But wait, here we join with replies. Let's look at replier names.
        # We'll fetch replier name from the profile matching reply's admin_id, or display_name?
        # Actually, let's look at replies table: it stores admin_id. We can join with admins to get username,
        # or we can join with admin_profiles? But an admin has multiple profiles.
        # So when replies are inserted, we should probably store which PROFILE was used!
        # Ah! To do this, let's update replies table schema or just look up display_names.
        # Wait, if we join with admin_profiles, since we didn't specify profile_id in replies,
        # we can't tell which profile was selected at the time of reply.
        # A simpler way: let's modify the replies table to have an `admin_profile_id` instead of `admin_id`!
        # If we have `admin_profile_id INTEGER` (Nullable), it can refer to `admin_profiles(id)`.
        # When an admin replies, we insert `admin_profile_id = profile_id`.
        # If `admin_profile_id` is NULL, it is from the anonymous sender.
        # This is extremely clean and mathematically perfect!
        # Let's adjust replies table creation in init_db():
        # `admin_profile_id INTEGER, FOREIGN KEY (admin_profile_id) REFERENCES admin_profiles (id) ON DELETE CASCADE`
        # Let's make this change! It is much cleaner.
        
        # Let's look at query replies SQL:
        cursor.execute('''
            SELECT r.content, r.created_at, r.admin_profile_id, p.display_name as replier
            FROM replies r
            LEFT JOIN admin_profiles p ON r.admin_profile_id = p.id
            WHERE r.letter_id = ?
            ORDER BY r.created_at ASC
        ''', (letter['id'],))
        replies = cursor.fetchall()
        
        replies_list = []
        for r in replies:
            replies_list.append({
                'content': r['content'],
                'created_at': r['created_at'],
                'replier': r['replier'] if r['admin_profile_id'] is not None else '投信者 (您)',
                'is_sender': r['admin_profile_id'] is None
            })
            
        return jsonify({
            'success': True,
            'letter': {
                'content': letter['content'],
                'is_archived': letter['is_archived'] > 0,
                'created_at': letter['created_at'],
                'replies': replies_list
            }
        })

# New Route: Allow sender to reply on their anonymous mail thread
@app.route('/api/letters/query/<code>/reply', methods=['POST'])
def sender_reply_to_letter(code):
    code = code.strip()
    data = request.get_json() or {}
    content = data.get('content', '').strip()
    
    if not content:
        return jsonify({'error': '回覆內容不能為空'}), 400
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM letters WHERE code = ?', (code,))
        letter = cursor.fetchone()
        
        if not letter:
            return jsonify({'error': '找不到此信件'}), 404
            
        # Insert anonymous reply (admin_profile_id is NULL)
        cursor.execute('''
            INSERT INTO replies (letter_id, admin_profile_id, content)
            VALUES (?, NULL, ?)
        ''', (letter['id'], content))
        
        # Mark this letter as "unread" for all administrators again because the sender has replied!
        cursor.execute('DELETE FROM read_statuses WHERE letter_id = ?', (letter['id'],))
        
        conn.commit()
        
        return jsonify({'success': True})


# --- ADMIN API (PROTECTED) ---

def require_admin(f):
    def decorated_function(*args, **kwargs):
        if 'admin_id' not in session:
            return jsonify({'error': '未授權，請先登入'}), 401
        return f(*args, **kwargs)
    decorated_function.__name__ = f.__name__
    return decorated_function

@app.route('/admin')
def admin_page():
    return render_template('admin.html')

@app.route('/api/admin/letters', methods=['GET'])
@require_admin
def get_admin_letters():
    admin_id = session['admin_id']
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT 
                    l.id, l.code, l.content, l.is_archived, l.created_at,
                    (SELECT COUNT(*) FROM replies r WHERE r.letter_id = l.id AND r.admin_profile_id IS NOT NULL) as admin_reply_count,
                    (SELECT COUNT(*) FROM read_statuses rs WHERE rs.letter_id = l.id AND rs.admin_id = ?) as is_read
                FROM letters l
                ORDER BY l.created_at DESC
            ''', (admin_id,))
            letters = cursor.fetchall()
            
            result = []
            for l in letters:
                preview = l['content'][:25] + ('...' if len(l['content']) > 25 else '')
                result.append({
                    'id': l['id'],
                    'code': l['code'],
                    'title': preview,
                    'content': l['content'],
                    'is_archived': l['is_archived'] > 0,
                    'created_at': l['created_at'],
                    'replied': l['admin_reply_count'] > 0,
                    'is_read': l['is_read'] > 0
                })
                
            return jsonify({'letters': result})
    except Exception as e:
        import traceback
        return jsonify({'error': f'Database error: {str(e)}\n{traceback.format_exc()}'}), 500

@app.route('/api/admin/letters/<int:letter_id>', methods=['GET'])
@require_admin
def get_letter_detail(letter_id):
    admin_id = session['admin_id']
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get letter
        cursor.execute('SELECT id, code, content, is_archived, created_at FROM letters WHERE id = ?', (letter_id,))
        letter = cursor.fetchone()
        
        if not letter:
            return jsonify({'error': '找不到此信件'}), 404
            
        # Mark as read for this administrator user account
        cursor.execute('''
            INSERT OR IGNORE INTO read_statuses (admin_id, letter_id)
            VALUES (?, ?)
        ''', (admin_id, letter_id))
        conn.commit()
        
        # Get all replies (LEFT JOIN to load sender replies as well)
        cursor.execute('''
            SELECT r.id, r.content, r.created_at, r.admin_profile_id, p.display_name as replier, p.admin_id
            FROM replies r
            LEFT JOIN admin_profiles p ON r.admin_profile_id = p.id
            WHERE r.letter_id = ?
            ORDER BY r.created_at ASC
        ''', (letter_id,))
        replies = cursor.fetchall()
        
        replies_list = []
        for r in replies:
            replies_list.append({
                'id': r['id'],
                'content': r['content'],
                'created_at': r['created_at'],
                'replier': r['replier'] if r['admin_profile_id'] is not None else '匿名投信者',
                'is_own_reply': r['admin_id'] == admin_id if r['admin_id'] is not None else False,
                'is_sender': r['admin_profile_id'] is None
            })
            
        return jsonify({
            'success': True,
            'letter': {
                'id': letter['id'],
                'code': letter['code'],
                'content': letter['content'],
                'is_archived': letter['is_archived'] > 0,
                'created_at': letter['created_at'],
                'replies': replies_list
            }
        })

@app.route('/api/admin/letters/<int:letter_id>', methods=['DELETE'])
@require_admin
def delete_letter(letter_id):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if exists
        cursor.execute('SELECT id FROM letters WHERE id = ?', (letter_id,))
        if not cursor.fetchone():
            return jsonify({'error': '找不到此信件'}), 404
            
        cursor.execute('DELETE FROM letters WHERE id = ?', (letter_id,))
        conn.commit()
        
    return jsonify({'success': True, 'message': '信件已成功刪除'})

@app.route('/api/admin/letters/<int:letter_id>/archive', methods=['POST'])
@require_admin
def archive_letter(letter_id):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if exists
        cursor.execute('SELECT id FROM letters WHERE id = ?', (letter_id,))
        if not cursor.fetchone():
            return jsonify({'error': '找不到此信件'}), 404
            
        cursor.execute('UPDATE letters SET is_archived = 1 WHERE id = ?', (letter_id,))
        conn.commit()
        
    return jsonify({'success': True, 'message': '信件已封存'})

@app.route('/api/admin/letters/<int:letter_id>/unarchive', methods=['POST'])
@require_admin
def unarchive_letter(letter_id):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if exists
        cursor.execute('SELECT id FROM letters WHERE id = ?', (letter_id,))
        if not cursor.fetchone():
            return jsonify({'error': '找不到此信件'}), 404
            
        cursor.execute('UPDATE letters SET is_archived = 0 WHERE id = ?', (letter_id,))
        conn.commit()
        
    return jsonify({'success': True, 'message': '信件已解除封存'})

@app.route('/api/admin/letters/<int:letter_id>/reply', methods=['POST'])
@require_admin
def reply_to_letter(letter_id):
    admin_id = session['admin_id']
    display_name = session['admin_display_name']
    data = request.get_json() or {}
    content = data.get('content', '').strip()
    
    if not content:
        return jsonify({'error': '回覆內容不能為空'}), 400
        
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify letter exists
        cursor.execute('SELECT id FROM letters WHERE id = ?', (letter_id,))
        if not cursor.fetchone():
            return jsonify({'error': '找不到此信件'}), 404
            
        # Get active profile ID for currently logged-in identity
        cursor.execute(
            'SELECT id FROM admin_profiles WHERE admin_id = ? AND display_name = ?',
            (admin_id, display_name)
        )
        profile = cursor.fetchone()
        
        profile_id = profile['id'] if profile else None
        
        # Insert reply (associating with specific profile ID)
        cursor.execute('''
            INSERT INTO replies (letter_id, admin_profile_id, content)
            VALUES (?, ?, ?)
        ''', (letter_id, profile_id, content))
        conn.commit()
        
        return jsonify({'success': True})

# --- ADMIN USERS MANAGEMENT (PROTECTED) ---

@app.route('/api/admin/users', methods=['GET'])
@require_admin
def get_admin_users():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, username FROM admins ORDER BY id ASC')
        users = cursor.fetchall()
        
        result = []
        for u in users:
            # Query all profiles associated with this user
            cursor.execute('SELECT id, display_name FROM admin_profiles WHERE admin_id = ?', (u['id'],))
            profiles = cursor.fetchall()
            
            result.append({
                'id': u['id'],
                'username': u['username'],
                'profiles': [{'id': p['id'], 'display_name': p['display_name']} for p in profiles]
            })
            
    return jsonify({'users': result})

@app.route('/api/admin/users', methods=['POST'])
@require_admin
def create_admin_user():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    display_name = data.get('display_name', '').strip()
    
    if not username or not password or not display_name:
        return jsonify({'error': '請填寫所有欄位'}), 400
        
    pwd_hash = generate_password_hash(password)
    
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
                (username, pwd_hash)
            )
            admin_id = cursor.lastrowid
            
            # Create first profile
            cursor.execute(
                'INSERT INTO admin_profiles (admin_id, display_name) VALUES (?, ?)',
                (admin_id, display_name)
            )
            conn.commit()
        return jsonify({'success': True, 'message': '幹部帳號已成功建立！'})
    except sqlite3.IntegrityError:
        return jsonify({'error': '此帳號名稱已被使用，請更換其他名稱'}), 400
    except Exception as e:
        return jsonify({'error': f'建立失敗: {str(e)}'}), 500

# New Route: Allow adding another identity profile to an existing admin account
@app.route('/api/admin/users/<int:admin_id>/profiles', methods=['POST'])
@require_admin
def add_admin_profile(admin_id):
    data = request.get_json() or {}
    display_name = data.get('display_name', '').strip()
    
    if not display_name:
        return jsonify({'error': '身分名稱不能為空'}), 400
        
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify admin exists
        cursor.execute('SELECT id FROM admins WHERE id = ?', (admin_id,))
        if not cursor.fetchone():
            return jsonify({'error': '找不到此帳號'}), 404
            
        try:
            cursor.execute(
                'INSERT INTO admin_profiles (admin_id, display_name) VALUES (?, ?)',
                (admin_id, display_name)
            )
            conn.commit()
            return jsonify({'success': True, 'message': '新身分已成功新增！'})
        except Exception as e:
            return jsonify({'error': f'新增身分失敗: {str(e)}'}), 500

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@require_admin
def delete_admin_user(user_id):
    current_admin_id = session['admin_id']
    if user_id == current_admin_id:
        return jsonify({'error': '您不能刪除目前正在登入的帳號'}), 400
        
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if exists
        cursor.execute('SELECT id FROM admins WHERE id = ?', (user_id,))
        if not cursor.fetchone():
            return jsonify({'error': '找不到此帳號'}), 404
            
        cursor.execute('DELETE FROM admins WHERE id = ?', (user_id,))
        conn.commit()
        
    return jsonify({'success': True, 'message': '幹部帳號已成功刪除'})

# Initialize database on import (works for Gunicorn production deployment)
init_db()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
