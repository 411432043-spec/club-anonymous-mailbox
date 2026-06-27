// Tab switching logic
function switchTab(tabName) {
    const submitTab = document.getElementById('tab-submit');
    const queryTab = document.getElementById('tab-query');
    const submitBtn = document.getElementById('tab-submit-btn');
    const queryBtn = document.getElementById('tab-query-btn');

    if (tabName === 'submit') {
        submitTab.style.display = 'block';
        queryTab.style.display = 'none';
        submitBtn.classList.add('active');
        queryBtn.classList.remove('active');
    } else {
        submitTab.style.display = 'none';
        queryTab.style.display = 'block';
        submitBtn.classList.remove('active');
        queryBtn.classList.add('active');
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
            body: JSON.stringify({ content })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Show success screen
            document.getElementById('submit-form').style.display = 'none';
            document.getElementById('submit-success-card').style.display = 'block';
            document.getElementById('generated-code').textContent = data.code;
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
