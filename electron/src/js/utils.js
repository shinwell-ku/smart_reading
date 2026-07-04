/**
 * AI智慧阅读 - 工具函数
 */

// ============================================================
// DOM 工具
// ============================================================

/** 元素选择器快捷方式 */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/** 创建元素 */
function createElement(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') el.className = val;
    else if (key === 'style' && typeof val === 'object') Object.assign(el.style, val);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), val);
    else if (key === 'innerHTML') el.innerHTML = val;
    else if (key === 'textContent') el.textContent = val;
    else el.setAttribute(key, val);
  }
  for (const child of children) {
    if (child) el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

// ============================================================
// 消息提示
// ============================================================

let toastTimer = null;

function showToast(message, duration = 2500) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ============================================================
// 格式化工具
// ============================================================

/** 文件大小格式化 */
function formatFileSize(bytes) {
  if (!bytes) return '未知';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

/** 日期格式化 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/** 文本截断 */
function truncateText(text, maxLen = 50) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

// ============================================================
// 防抖节流
// ============================================================

function debounce(fn, delay = 300) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function throttle(fn, limit = 200) {
  let inThrottle = false;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ============================================================
// 存储工具
// ============================================================

const LocalStore = {
  get(key, def = null) {
    try {
      const val = localStorage.getItem(`sr_${key}`);
      return val ? JSON.parse(val) : def;
    } catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem(`sr_${key}`, JSON.stringify(val)); } catch {}
  },
  remove(key) {
    try { localStorage.removeItem(`sr_${key}`); } catch {}
  }
};

// ============================================================
// 语言相关
// ============================================================

const LANG_NAMES = {
  'zh': '中文', 'en': 'English', 'ja': '日本語', 'ko': '한국어',
  'fr': 'Français', 'de': 'Deutsch', 'es': 'Español', 'ru': 'Русский',
  'pt': 'Português', 'it': 'Italiano', 'auto': '自动检测'
};

function getLangName(code) {
  return LANG_NAMES[code] || code;
}

// ============================================================
// 自定义确认对话框（替代浏览器 confirm）
// ============================================================
const UI = {
  /** 显示确认对话框，返回 Promise<boolean> */
  confirm(message, danger = false) {
    return new Promise(resolve => {
      const modal = $('#confirmModal');
      const msgEl = $('#confirmMessage');
      const okBtn = $('#btnConfirmOk');
      const cancelBtn = $('#btnConfirmCancel');

      msgEl.textContent = message;
      okBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');

      modal.classList.add('show');

      const cleanup = () => {
        modal.classList.remove('show');
        okBtn.onclick = null;
        cancelBtn.onclick = null;
      };

      okBtn.onclick = () => { cleanup(); resolve(true); };
      cancelBtn.onclick = () => { cleanup(); resolve(false); };
    });
  },

  hideConfirm() {
    $('#confirmModal').classList.remove('show');
  }
};
