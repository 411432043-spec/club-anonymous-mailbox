// Tab switching logic
function switchTab(tabName) {
    const submitTab = document.getElementById('tab-submit');
    const queryTab = document.getElementById('tab-query');
    const publicTab = document.getElementById('tab-public');
    
    const submitBtn = document.getElementById('tab-submit-btn');
    const queryBtn = document.getElementById('tab-query-btn');
    const publicBtn = document.getElementById('tab-public-btn');

    if (tabName === 'submit') {
        submitTab.style.display = 'block';
        queryTab.style.display = 'none';
        publicTab.style.display = 'none';
        submitBtn.classList.add('active');
        queryBtn.classList.remove('active');
        publicBtn.classList.remove('active');
    } else if (tabName === 'query') {
        submitTab.style.display = 'none';
        queryTab.style.display = 'block';
        publicTab.style.display = 'none';
        submitBtn.classList.remove('active');
        queryBtn.classList.add('active');
        publicBtn.classList.remove('active');
    } else if (tabName === 'public') {
        submitTab.style.display = 'none';
        queryTab.style.display = 'none';
        publicTab.style.display = 'block';
        submitBtn.classList.remove('active');
        queryBtn.classList.remove('active');
        publicBtn.classList.add('active');
        fetchPublicBoard();
    }
}

// Toast notification helper
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast-msg show toast-${type}`;
    
    setTimeout(() => {
        toast.className = 'toast-msg';
    }, 3500);
}

// Handle anonymous mailbox form submission
async function handleLetterSubmit(event) {
    event.preventDefault();
    
    const content = document.getElementById('content').value.trim();
    const isPublicRadio = document.querySelector('input[name="is_public"]:checked');
    const is_public = isPublicRadio ? parseInt(isPublicRadio.value) === 1 : false;
    
    if (!content) {
        showToast('請輸入信件內容！', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '傳送中... ⌛';

    try {
        const response = await fetch('/api/letters/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, is_public })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Show success screen
            document.getElementById('submit-form').style.display = 'none';
            document.getElementById('submit-success-card').style.display = 'block';
            
            document.getElementById('generated-code').textContent = data.code;
            if (is_public) {
                document.getElementById('success-private-msg').style.display = 'none';
                document.getElementById('success-public-msg').style.display = 'block';
            } else {
                document.getElementById('success-private-msg').style.display = 'block';
                document.getElementById('success-public-msg').style.display = 'none';
            }
            showToast('匿名信件已成功送出！');
        } else {
            showToast(data.error || '送出失敗，請稍後再試', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = '發送匿名信件 🚀';
        }
    } catch (error) {
        console.error(error);
        showToast('網路連線錯誤，請檢查網路狀態', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '發送匿名信件 🚀';
    }
}

// Copy Code logic
function copyCode() {
    const codeText = document.getElementById('generated-code').textContent;
    navigator.clipboard.writeText(codeText)
        .then(() => {
            const copyBtn = document.getElementById('btn-copy-code');
            copyBtn.textContent = '已複製！ ✓';
            showToast('提取碼已複製到剪貼簿！');
            setTimeout(() => {
                copyBtn.textContent = '複製';
            }, 2000);
        })
        .catch(err => {
            console.error('Copy failed:', err);
            showToast('複製失敗，請手動複製', 'error');
        });
}

// Reset submit form for sending another letter
function resetSubmitForm() {
    document.getElementById('submit-form').reset();
    document.getElementById('submit-form').style.display = 'block';
    document.getElementById('submit-success-card').style.display = 'none';
    
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>發送匿名信件</span> 🚀';
}

// Query Letter with code
async function handleLetterQuery() {
    const codeInput = document.getElementById('query-code-input').value.trim();
    const resultDiv = document.getElementById('query-result');
    const errorDiv = document.getElementById('query-error');
    
    if (!codeInput) {
        showToast('請輸入提取碼！', 'error');
        return;
    }
    
    resultDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    
    try {
        const response = await fetch(`/api/letters/query/${codeInput}`);
        const data = await response.json();
        
        if (response.ok && data.success) {
            const letter = data.letter;
            
            // Format Date
            const date = new Date(letter.created_at + 'Z');
            document.getElementById('result-date').textContent = date.toLocaleString('zh-TW');
            document.getElementById('result-content').textContent = letter.content;
            
            // Render replies
            const repliesContainer = document.getElementById('replies-container');
            repliesContainer.innerHTML = '';
            
            if (letter.replies.length === 0) {
                repliesContainer.innerHTML = `
                    <div style="color: var(--text-muted); font-style: italic; font-size: 0.95rem;">
                        目前尚未有管理員回覆，請耐心等待。
                    </div>
                `;
            } else {
                letter.replies.forEach(reply => {
                    const rDate = new Date(reply.created_at + 'Z');
                    const replyItem = document.createElement('div');
                    replyItem.className = 'reply-item';
                    replyItem.innerHTML = `
                        <div class="reply-header">
                            <span style="font-weight: 600; color: var(--primary);">${reply.replier}</span>
                            <span>${rDate.toLocaleString('zh-TW')}</span>
                        </div>
                        <div class="reply-content">${reply.content}</div>
                    `;
                    repliesContainer.appendChild(replyItem);
                });
            }
            
            resultDiv.style.display = 'block';
            showToast('查詢成功！');
        } else {
            errorDiv.textContent = data.error || '查詢失敗';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error(error);
        showToast('網路連線錯誤，請稍後再試', 'error');
    }
}

// Submit reply from the anonymous sender
async function submitSenderReply(event) {
    event.preventDefault();
    const codeInput = document.getElementById('query-code-input').value.trim();
    const replyContentInput = document.getElementById('sender-reply-content');
    const content = replyContentInput.value.trim();
    
    if (!content) {
        showToast('請輸入回覆內容！', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/letters/query/${codeInput}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast('回覆成功送出！');
            replyContentInput.value = '';
            // Refresh conversation timeline
            await handleLetterQuery();
        } else {
            showToast(data.error || '回覆失敗', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('連線錯誤，請稍後再試', 'error');
    }
}

// Fetch all public letters and render them to the public board
async function fetchPublicBoard() {
    const container = document.getElementById('public-board-container');
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">載入中... ⌛</div>';
    
    try {
        const response = await fetch('/api/letters/public');
        const data = await response.json();
        
        if (response.ok && data.success) {
            container.innerHTML = '';
            if (data.letters.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); padding: 3rem;">
                        📭 目前還沒有公開發布的信件喔！
                    </div>
                `;
                return;
            }
            
            data.letters.forEach(letter => {
                const date = new Date(letter.created_at + 'Z');
                const card = document.createElement('div');
                card.className = 'letter-result-card fadeIn';
                card.style.background = 'rgba(255, 255, 255, 0.02)';
                card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
                card.style.marginBottom = '1.5rem';
                card.style.padding = '1.5rem';
                card.style.borderRadius = '16px';
                
                // Format replies html
                let repliesHtml = '';
                if (letter.replies.length === 0) {
                    repliesHtml = `
                        <div style="color: var(--text-muted); font-style: italic; font-size: 0.9rem; padding-left: 0.5rem; margin-top: 0.5rem;">
                            目前尚未有管理員回覆。
                        </div>
                    `;
                } else {
                    letter.replies.forEach(reply => {
                        const rDate = new Date(reply.created_at + 'Z');
                        repliesHtml += `
                            <div class="reply-item" style="border-left: 3px solid var(--secondary); padding-left: 1rem; margin-top: 1rem;">
                                <div class="reply-header" style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.3rem;">
                                    <span style="font-weight: 600; color: var(--secondary);">${reply.replier}</span>
                                    <span style="color: var(--text-muted);">${rDate.toLocaleString('zh-TW')}</span>
                                </div>
                                <div class="reply-content" style="font-size: 0.95rem; color: #fff; white-space: pre-wrap;">${reply.content}</div>
                            </div>
                        `;
                    });
                }
                
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--panel-border); padding-bottom: 0.8rem;">
                        <span style="font-size: 0.85rem; color: var(--text-muted);">
                            🕒 發表時間：${date.toLocaleString('zh-TW')}
                        </span>
                    </div>
                    <div style="white-space: pre-wrap; background: rgba(15, 23, 42, 0.3); padding: 1.2rem; border-radius: 12px; margin-bottom: 1.5rem; color: #f1f5f9; font-size: 1rem;">${letter.content}</div>
                    
                    <h4 style="font-size: 1.05rem; margin-bottom: 0.8rem; color: var(--secondary); display: flex; align-items: center; gap: 0.5rem;">
                        <span>💬</span> 幹部回覆
                    </h4>
                    <div class="replies-timeline" style="margin-top: 0.5rem;">
                        ${repliesHtml}
                    </div>
                `;
                container.appendChild(card);
            });
        } else {
            container.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 2rem;">載入失敗：${data.error || '未知錯誤'}</div>`;
        }
    } catch (error) {
        console.error(error);
        container.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 2rem;">網路連線錯誤，請稍後再試</div>';
    }
}
