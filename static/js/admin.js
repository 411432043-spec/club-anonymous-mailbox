let currentAdmin = null;
let lettersData = [];
let activeLetterId = null;
let currentAdminSection = 'letters'; // 'letters' or 'users'

// Global Toast helper
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast-msg show toast-${type}`;
    
    setTimeout(() => {
        toast.className = 'toast-msg';
    }, 3000);
}

// Format date to local string helper
function formatDate(dateStr) {
    const date = new Date(dateStr + 'Z');
    return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Document Load Event
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
});

// Check if admin is logged in
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        
        if (data.logged_in) {
            currentAdmin = data.admin;
            showDashboard();
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('Auth verification error:', error);
        showLogin();
    }
}

// Toggle Dashboard Sections (Letters / Users Management Tabs)
function switchAdminSection(section) {
    currentAdminSection = section;
    const btnLetters = document.getElementById('btn-nav-letters');
    const btnUsers = document.getElementById('btn-nav-users');
    const viewLetters = document.getElementById('letters-dashboard-view');
    const viewUsers = document.getElementById('users-dashboard-view');
    
    if (section === 'letters') {
        btnLetters.classList.add('active');
        btnUsers.classList.remove('active');
        viewLetters.style.display = 'grid';
        viewUsers.style.display = 'none';
        loadLettersList();
    } else {
        btnLetters.classList.remove('active');
        btnUsers.classList.add('active');
        viewLetters.style.display = 'none';
        viewUsers.style.display = 'grid';
        loadUsersList();
    }
}

// Show Login Panel
function showLogin() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('login-form-wrapper').style.display = 'block';
    document.getElementById('identity-select-wrapper').style.display = 'none';
    
    document.getElementById('letters-dashboard-view').style.display = 'none';
    document.getElementById('users-dashboard-view').style.display = 'none';
    
    document.getElementById('btn-nav-letters').style.display = 'none';
    document.getElementById('btn-nav-users').style.display = 'none';
    document.getElementById('btn-logout').style.display = 'none';
}

// Show Dashboard Panels
function showDashboard() {
    document.getElementById('login-section').style.display = 'none';
    
    document.getElementById('btn-nav-letters').style.display = 'inline-block';
    document.getElementById('btn-nav-users').style.display = 'inline-block';
    document.getElementById('btn-logout').style.display = 'inline-block';
    
    // Select correct visual display
    switchAdminSection(currentAdminSection);
}

// Handle Login Form Submission
async function handleLogin(event) {
    event.preventDefault();
    const usernameInput = document.getElementById('username').value.trim();
    const passwordInput = document.getElementById('password').value.trim();
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            if (data.requires_selection) {
                // Show identity selector
                document.getElementById('login-form-wrapper').style.display = 'none';
                document.getElementById('identity-select-wrapper').style.display = 'block';
                
                const container = document.getElementById('identity-buttons-container');
                container.innerHTML = '';
                
                data.profiles.forEach(p => {
                    const btn = document.createElement('button');
                    btn.className = 'btn-submit';
                    btn.style.width = '100%';
                    btn.style.padding = '0.9rem';
                    btn.style.margin = '0.2rem 0';
                    btn.style.borderRadius = '10px';
                    btn.style.fontSize = '1rem';
                    btn.style.fontWeight = '600';
                    btn.style.cursor = 'pointer';
                    btn.style.background = 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)';
                    btn.textContent = p.display_name;
                    btn.onclick = () => selectLoginIdentity(data.admin_id, p.id);
                    container.appendChild(btn);
                });
            } else {
                currentAdmin = data.admin;
                showToast(`歡迎回來！`);
                await checkAuth();
            }
        } else {
            showToast(data.error || '帳號或密碼錯誤', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('無法連線至伺服器', 'error');
    }
}

// Select active login identity from selection view list
async function selectLoginIdentity(adminId, profileId) {
    try {
        const response = await fetch('/api/auth/login/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_id: adminId, profile_id: profileId })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            currentAdmin = data.admin;
            document.getElementById('login-form-wrapper').style.display = 'block';
            document.getElementById('identity-select-wrapper').style.display = 'none';
            showToast(`已登入為: ${data.admin.display_name}`);
            await checkAuth();
        } else {
            showToast(data.error || '身分驗證失敗，請重試', 'error');
            cancelIdentitySelection();
        }
    } catch (error) {
        console.error(error);
        showToast('身分登入選取失敗', 'error');
    }
}

// Cancel Identity Select and Return to Login Form
async function cancelIdentitySelection() {
    await fetch('/api/auth/logout', { method: 'POST' });
    document.getElementById('login-form-wrapper').style.display = 'block';
    document.getElementById('identity-select-wrapper').style.display = 'none';
}

// Handle Logout Trigger
async function handleLogout() {
    try {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        if (response.ok) {
            currentAdmin = null;
            lettersData = [];
            activeLetterId = null;
            currentAdminSection = 'letters';
            showToast('您已成功登出');
            showLogin();
        }
    } catch (error) {
        console.error(error);
        showToast('登出發生異常', 'error');
    }
}

// Load Letters List for Sidebar
async function loadLettersList() {
    try {
        const response = await fetch('/api/admin/letters');
        const data = await response.json();
        
        if (response.ok) {
            lettersData = data.letters;
            renderSidebarList();
            
            // Set current display tag
            const userTag = document.getElementById('current-user-tag');
            if (userTag) {
                userTag.textContent = `👤 ${currentAdmin.display_name}`;
            }
        } else {
            showToast(data.error || '載入信件失敗', 'error');
        }
    } catch (error) {
        console.error('Failed to load letters:', error);
        showToast('載入信件錯誤', 'error');
    }
}

// Filter and Render Letters List (Search and Archive filters)
function renderSidebarList() {
    const listContainer = document.getElementById('letter-list-container');
    listContainer.innerHTML = '';
    
    const readFilter = document.getElementById('filter-read').value;
    const repliedFilter = document.getElementById('filter-replied').value;
    const archiveFilter = document.getElementById('filter-archive').value;
    const searchQuery = document.getElementById('search-input').value.trim().toLowerCase();
    
    // Apply filters
    const filtered = lettersData.filter(letter => {
        // 1. Archive Filter
        if (archiveFilter === 'active' && letter.is_archived) return false;
        if (archiveFilter === 'archived' && !letter.is_archived) return false;
        
        // 2. Read Filter
        if (readFilter === 'unread' && letter.is_read) return false;
        if (readFilter === 'read' && !letter.is_read) return false;
        
        // 3. Reply Filter
        if (repliedFilter === 'unreplied' && letter.replied) return false;
        if (repliedFilter === 'replied' && !letter.replied) return false;
        
        // 4. Keyword Search Filter
        if (searchQuery) {
            const matchesCode = letter.code.toLowerCase().includes(searchQuery);
            const matchesContent = letter.content.toLowerCase().includes(searchQuery);
            if (!matchesCode && !matchesContent) return false;
        }
        
        return true;
    });
    
    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 2rem 0;">
                無符合篩選條件的信件
            </div>
        `;
        return;
    }
    
    filtered.forEach(letter => {
        const item = document.createElement('div');
        item.className = `letter-list-item ${letter.id === activeLetterId ? 'active' : ''}`;
        item.onclick = () => selectLetter(letter.id);
        
        const dotHtml = letter.is_read 
            ? '<span class="status-indicator status-read"></span>' 
            : '<span class="status-indicator status-unread" title="個人未讀"></span>';
            
        const replyTag = letter.replied 
            ? '<span style="color: var(--success); font-size: 0.75rem; font-weight: 500;">(已回覆)</span>' 
            : '<span style="color: var(--warning); font-size: 0.75rem; font-weight: 500;">(未回覆)</span>';
            
        const archiveTag = letter.is_archived
            ? ' <span style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; font-size: 0.65rem; padding: 0.1rem 0.3rem; border-radius: 4px; font-weight: 600;">已封存</span>'
            : '';
            
        item.innerHTML = `
            <div class="item-header">
                <span class="item-title">${dotHtml}${letter.title}</span>
                ${archiveTag}
            </div>
            <div class="item-header" style="margin-bottom: 0;">
                <span class="item-meta">${formatDate(letter.created_at)}</span>
                ${replyTag}
            </div>
        `;
        
        listContainer.appendChild(item);
    });
}

// Select a letter and display on the right details pane
async function selectLetter(letterId) {
    activeLetterId = letterId;
    
    const idx = lettersData.findIndex(l => l.id === letterId);
    if (idx !== -1) {
        lettersData[idx].is_read = true;
    }
    renderSidebarList();
    
    const detailPane = document.getElementById('letter-detail-pane');
    detailPane.innerHTML = `
        <div class="empty-placeholder">
            <div class="empty-icon">⌛</div>
            <h3>載入信件中...</h3>
        </div>
    `;
    
    try {
        const response = await fetch(`/api/admin/letters/${letterId}`);
        const data = await response.json();
        
        if (response.ok && data.success) {
            const letter = data.letter;
            
            // Build Replies UI
            let repliesHtml = '';
            if (letter.replies.length === 0) {
                repliesHtml = '<div style="color: var(--text-muted); font-style: italic; font-size: 0.9rem;">此信件目前尚未有任何回覆。</div>';
            } else {
                letter.replies.forEach(reply => {
                    const isSender = reply.is_sender;
                    const replierColor = isSender ? 'var(--secondary)' : 'var(--primary)';
                    const ownReplyTag = reply.is_own_reply ? ' <span style="background: rgba(167,139,250,0.2); padding: 0.1rem 0.3rem; border-radius: 4px; font-size: 0.7rem; color: var(--primary);">您</span>' : '';
                    
                    const exportBtnHtml = isSender ? '' : `
                        <button class="btn-copy" style="position: absolute; right: 0; bottom: 0; padding: 0.25rem 0.6rem; font-size: 0.75rem; border-radius: 6px;" 
                            onclick="exportIGCard('${escapeJS(letter.content)}', '${escapeJS(reply.content)}', '${escapeJS(reply.replier)}', '${letter.code}')">
                            📸 匯出 IG 分享圖
                        </button>
                    `;
                    
                    repliesHtml += `
                        <div class="reply-item" style="position: relative; ${isSender ? 'border-left: 2px dashed rgba(56, 189, 248, 0.4); padding-left: 1rem; margin-left: -1rem;' : ''}">
                            <div class="reply-header">
                                <span style="font-weight:600; color: ${replierColor};">${reply.replier}${ownReplyTag}</span>
                                <span>${formatDate(reply.created_at)}</span>
                            </div>
                            <div class="reply-content">${reply.content}</div>
                            ${exportBtnHtml}
                        </div>
                    `;
                });
            }
            
            // Archive and Delete buttons
            const archiveBtnHtml = letter.is_archived
                ? `<button class="btn-copy" style="background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.4); color: #fbbf24;" onclick="unarchiveLetter(${letter.id})">📤 取消封存</button>`
                : `<button class="btn-copy" style="background: rgba(245, 158, 11, 0.1); border-color: var(--panel-border); color: #f59e0b;" onclick="archiveLetter(${letter.id})">📦 封存信件</button>`;
                
            const deleteBtnHtml = `<button class="btn-copy" style="background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.4); color: #f87171;" onclick="deleteLetter(${letter.id})">🗑️ 刪除信件</button>`;
            
            detailPane.innerHTML = `
                <div class="detail-header">
                    <div class="detail-title-row" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <h2 class="detail-title">📬 匿名來信</h2>
                        <div class="detail-actions" style="display: flex; gap: 0.5rem;">
                            ${archiveBtnHtml}
                            ${deleteBtnHtml}
                        </div>
                    </div>
                    <div class="detail-meta" style="margin-top: 0.75rem;">
                        <span>提取碼: <strong style="color: var(--secondary); font-family: monospace; font-size: 1.15rem; letter-spacing: 0.5px;">${letter.code}</strong></span>
                        <span>|</span>
                        <span>投遞時間: ${formatDate(letter.created_at)}</span>
                    </div>
                </div>
                
                <div class="detail-body">${letter.content}</div>
                
                <div style="display: flex; justify-content: flex-end; margin-top: -1rem; margin-bottom: 2rem;">
                    <button class="btn-copy" style="padding: 0.35rem 0.8rem; font-size: 0.8rem; border-radius: 6px;" 
                        onclick="exportIGCard('${escapeJS(letter.content)}', null, null, '${letter.code}')">
                        📸 匯出此信件 (僅內容)
                    </button>
                </div>
                
                <h3 style="font-size: 1.15rem; margin-bottom: 1rem; color: var(--primary);">💬 回覆紀錄</h3>
                <div class="replies-timeline" style="margin-bottom: 2rem;">
                    ${repliesHtml}
                </div>
                
                <div class="reply-compose-box">
                    <h3 style="font-size: 1.1rem; margin-bottom: 0.75rem;">撰寫新回覆</h3>
                    <form id="reply-form" onsubmit="submitReply(event, ${letter.id})">
                        <div class="form-group">
                            <textarea id="reply-text" class="form-control" placeholder="請輸入回覆內容..." style="min-height: 100px;" required></textarea>
                        </div>
                        <button type="submit" class="btn-submit" style="width: auto; padding: 0.8rem 2rem; float: right;">
                            送出回覆 📤
                        </button>
                    </form>
                </div>
            `;
        } else {
            showToast(data.error || '載入信件詳情失敗', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('連線失敗', 'error');
    }
}

// Escape helper for embedding content in inline JS attributes
function escapeJS(str) {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

// Submit reply
async function submitReply(event, letterId) {
    event.preventDefault();
    const replyText = document.getElementById('reply-text').value.trim();
    
    if (!replyText) {
        showToast('回覆內容不得為空！', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/letters/${letterId}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: replyText })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast('回覆已成功送出！');
            await selectLetter(letterId);
            
            const idx = lettersData.findIndex(l => l.id === letterId);
            if (idx !== -1) {
                lettersData[idx].replied = true;
            }
            renderSidebarList();
        } else {
            showToast(data.error || '送出回覆失敗', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('連線失敗，請檢查網路狀態', 'error');
    }
}

// Delete Letter
async function deleteLetter(letterId) {
    if (!confirm('確定要永久刪除此信件嗎？這將連同所有回覆內容一併刪除，且無法還原！')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/letters/${letterId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (response.ok) {
            showToast('信件已成功刪除！');
            activeLetterId = null;
            resetDetailPane();
            await loadLettersList();
        } else {
            showToast(data.error || '刪除信件失敗', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('連線錯誤，請稍後再試', 'error');
    }
}

// Archive Letter
async function archiveLetter(letterId) {
    try {
        const response = await fetch(`/api/admin/letters/${letterId}/archive`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (response.ok) {
            showToast('信件已成功封存！');
            
            const archiveFilter = document.getElementById('filter-archive').value;
            if (archiveFilter === 'active') {
                activeLetterId = null;
                resetDetailPane();
            } else {
                await selectLetter(letterId);
            }
            
            await loadLettersList();
        } else {
            showToast(data.error || '封存信件失敗', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('連線錯誤', 'error');
    }
}

// Unarchive Letter
async function unarchiveLetter(letterId) {
    try {
        const response = await fetch(`/api/admin/letters/${letterId}/unarchive`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (response.ok) {
            showToast('已解除封存！');
            
            const archiveFilter = document.getElementById('filter-archive').value;
            if (archiveFilter === 'archived') {
                activeLetterId = null;
                resetDetailPane();
            } else {
                await selectLetter(letterId);
            }
            
            await loadLettersList();
        } else {
            showToast(data.error || '取消封存失敗', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('連線錯誤', 'error');
    }
}

// Reset Details Pane to Empty Placeholder
function resetDetailPane() {
    const detailPane = document.getElementById('letter-detail-pane');
    if (detailPane) {
        detailPane.innerHTML = `
            <div class="empty-placeholder">
                <div class="empty-icon">📂</div>
                <h3>請從左側選擇一封信件</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.5rem;">
                    點擊後可查看信件完整內容、變更已讀狀態並進行回覆、封存或刪除。
                </p>
            </div>
        `;
    }
}

// --- ADMIN USERS PORTAL LOGIC ---

// Fetch and load all admin accounts in a table list
async function loadUsersList() {
    const tableBody = document.getElementById('users-list-body');
    tableBody.innerHTML = `
        <tr>
            <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                載入管理員列表中... ⌛
            </td>
        </tr>
    `;
    
    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        
        if (response.ok) {
            renderUsersTable(data.users);
        } else {
            showToast(data.error || '載入管理員失敗', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('連線錯誤', 'error');
    }
}

// Render users list table rows (shows multiple identities per username)
function renderUsersTable(users) {
    const tableBody = document.getElementById('users-list-body');
    tableBody.innerHTML = '';
    
    if (users.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    目前資料庫無幹部資料
                </td>
            </tr>
        `;
        return;
    }
    
    users.forEach(user => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid var(--panel-border)';
        
        // Prevent deleting current active log in session user
        const isSelf = user.username === currentAdmin.username;
        const selfTag = isSelf ? ' <span style="background: rgba(167,139,250,0.15); color: var(--primary); padding: 0.1rem 0.3rem; border-radius: 4px; font-size: 0.75rem; font-weight:600;">目前登入</span>' : '';
        
        // Map all profiles to tag pills
        const profilesHtml = user.profiles.map(p => `
            <span style="display: inline-block; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.25); color: var(--secondary); padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.8rem; margin: 0.1rem;">
                ${p.display_name}
            </span>
        `).join('');
        
        const deleteButton = isSelf 
            ? `<span style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">無法刪除自己</span>`
            : `<button class="btn-copy" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239,68,68,0.25); color: #f87171; padding: 0.3rem 0.7rem; font-size: 0.8rem; border-radius: 6px;" onclick="deleteAdminUser(${user.id}, '${user.username}')">🗑️ 刪除帳號</button>`;
            
        row.innerHTML = `
            <td style="padding: 1rem 1.2rem; font-weight: 500; vertical-align: middle;">
                ${user.username}${selfTag}
            </td>
            <td style="padding: 1rem 1.2rem; vertical-align: middle;">
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem;">
                    ${profilesHtml}
                    <button class="btn-copy" style="padding: 0.15rem 0.4rem; font-size: 0.75rem; border-radius: 4px; background: rgba(167, 139, 250, 0.1); color: var(--primary); border-color: rgba(167,139,250,0.2);" onclick="appendNewIdentity(${user.id}, '${user.username}')">
                        ➕ 新增身分
                    </button>
                </div>
            </td>
            <td style="padding: 1rem 1.2rem; text-align: right; vertical-align: middle;">
                ${deleteButton}
            </td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Append new identity profile to an existing administrator account
async function appendNewIdentity(adminId, username) {
    const displayName = prompt(`請輸入為帳號「${username}」新增的身分名稱 (例如：器材部部長 小明)：`);
    if (!displayName || !displayName.trim()) return;
    
    try {
        const response = await fetch(`/api/admin/users/${adminId}/profiles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ display_name: displayName.trim() })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast('已成功為幹部新增職位身分！');
            await loadUsersList();
        } else {
            showToast(data.error || '新增身分失敗', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('無法連線至伺服器', 'error');
    }
}

// Handle Register/Create New Admin Form Submission
async function handleCreateUser(event) {
    event.preventDefault();
    const usernameEl = document.getElementById('new-username');
    const displayNameEl = document.getElementById('new-display-name');
    const passwordEl = document.getElementById('new-password');
    
    const username = usernameEl.value.trim();
    const display_name = displayNameEl.value.trim();
    const password = passwordEl.value.trim();
    
    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, display_name })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast(data.message || '幹部帳號已建立！');
            document.getElementById('create-user-form').reset();
            // Reload users list table
            await loadUsersList();
        } else {
            showToast(data.error || '建立帳號失敗', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('無法連線至伺服器', 'error');
    }
}

// Delete Admin Account via API
async function deleteAdminUser(userId, username) {
    if (!confirm(`確定要刪除帳號「${username}」嗎？這會連同其底下的所有職位身分一併清除，且該人員將無法再登入！`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message || '幹部帳號已刪除');
            await loadUsersList();
        } else {
            showToast(data.error || '刪除失敗', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('連線失敗', 'error');
    }
}

// Generate IG Share Card image via html2canvas
function exportIGCard(letterContent, replyContent, replierName, code) {
    showToast('圖片生成中，請稍候... 📸');
    
    const replyBlock = document.querySelector('#ig-share-card .reply-block');
    
    // Fill off-screen card contents
    document.getElementById('ig-letter-content').textContent = letterContent;
    
    if (replyContent) {
        document.getElementById('ig-reply-content').textContent = replyContent;
        document.getElementById('ig-replier-tag').textContent = `💬 ${replierName} 回覆：`;
        replyBlock.style.display = 'block';
    } else {
        replyBlock.style.display = 'none';
    }
    
    const cardEl = document.getElementById('ig-share-card');
    
    // Run html2canvas on the off-screen layout
    html2canvas(cardEl, {
        width: 1080,
        height: 1920,
        scale: 2, // Scale up for beautiful high-res outputs
        logging: false,
        useCORS: true,
        backgroundColor: '#0f172a'
    }).then(canvas => {
        const link = document.createElement('a');
        const fileNameSuffix = replyContent ? 'WithReply' : 'Only';
        link.download = `IG_Share_${code}_${fileNameSuffix}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('IG 分享圖已成功下載！');
    }).catch(err => {
        console.error('Image render error:', err);
        showToast('圖片生成失敗，請再試一次', 'error');
    });
}
