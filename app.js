/* C:\Users\dhara\.gemini\antigravity\scratch\phonepe-analyzer\app.js */

// Global State
let transactionsData = [];
let filteredData = [];
let categoryChartInstance = null;
let trendChartInstance = null;
let currentPage = 1;
const rowsPerPage = 40;
let currentSortColumn = 'date';
let currentSortDirection = 'desc';

// Setup PDF.js Worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
}

// Robust Custom Date Parser supporting DD/MM/YY, DD/MM/YYYY, and standard formats
function parseDateString(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  
  const str = String(dateStr).trim();
  
  // Regex for DD/MM/YY or DD/MM/YYYY or DD-MM-YY or DD-MM-YYYY or DD.MM.YYYY
  // Optional time: HH:MM or HH:MM:SS, optional AM/PM
  const partsMatch = /^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(str);
  if (partsMatch) {
    const day = parseInt(partsMatch[1], 10);
    const month = parseInt(partsMatch[2], 10) - 1; // 0-indexed month
    let year = parseInt(partsMatch[3], 10);
    if (year < 100) {
      year += 2000; // Assume 21st century for 2-digit years
    }
    
    let hours = partsMatch[4] ? parseInt(partsMatch[4], 10) : 0;
    const minutes = partsMatch[5] ? parseInt(partsMatch[5], 10) : 0;
    const seconds = partsMatch[6] ? parseInt(partsMatch[6], 10) : 0;
    const ampm = partsMatch[7];
    
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hours < 12) {
        hours += 12;
      } else if (ampm.toUpperCase() === 'AM' && hours === 12) {
        hours = 0;
      }
    }
    
    return new Date(year, month, day, hours, minutes, seconds);
  }
  
  // Standard fallback
  return new Date(str);
}

// Visual Coordinate-based Text Sorting helper
function getSortedTextFromPageContent(textContent) {
  if (!textContent || !textContent.items) return '';
  
  // Sort items visually: first by y (descending), then by x (ascending)
  const items = textContent.items.map(item => {
    return {
      str: item.str,
      x: item.transform ? item.transform[4] : 0,
      y: item.transform ? item.transform[5] : 0
    };
  });
  
  const tolerance = 4; // points
  const lines = [];
  
  items.forEach(item => {
    let placed = false;
    for (let line of lines) {
      if (Math.abs(line.y - item.y) <= tolerance) {
        line.items.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lines.push({
        y: item.y,
        items: [item]
      });
    }
  });
  
  // Sort lines from top to bottom (y descending)
  lines.sort((a, b) => b.y - a.y);
  
  // Sort items within each line from left to right (x ascending)
  let result = "";
  lines.forEach(line => {
    line.items.sort((a, b) => a.x - b.x);
    const lineText = line.items.map(item => item.str).join(' ');
    result += lineText + '\n';
  });
  
  return result;
}

// Category configuration
const CATEGORIES = {
  'P2P': { label: 'Peer Transfers (P2P)', color: '#60a5fa', cssClass: 'category-p2p' },
  'Food & Dining': { label: 'Food & Dining', color: '#f87171', cssClass: 'category-food' },
  'Shopping & Merchant': { label: 'Shopping & Merchant', color: '#f472b6', cssClass: 'category-shopping' },
  'Bills & Recharges': { label: 'Bills & Recharges', color: '#fbbf24', cssClass: 'category-bills' },
  'Investments & Finance': { label: 'Investments & Finance', color: '#34d399', cssClass: 'category-investments' },
  'Travel & Commute': { label: 'Travel & Commute', color: '#a78bfa', cssClass: 'category-travel' },
  'Cashback & Refunds': { label: 'Cashbacks & Refunds', color: '#22d3ee', cssClass: 'category-cashback' },
  'Others': { label: 'Others', color: '#94a3b8', cssClass: 'category-others' }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initLucide();
  setupEventListeners();
});

// Initialize Lucide Icons
function initLucide() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Theme Logic
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  const currentTheme = isLight ? 'light' : 'dark';
  localStorage.setItem('theme', currentTheme);
  updateThemeIcon(currentTheme);
  
  // Re-render charts and UI elements so they align with the theme
  if (transactionsData.length > 0) {
    applyFilters();
  }
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const sunIcon = btn.querySelector('.sun-icon');
  const moonIcon = btn.querySelector('.moon-icon');
  if (sunIcon && moonIcon) {
    if (theme === 'light') {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'inline-block';
    } else {
      sunIcon.style.display = 'inline-block';
      moonIcon.style.display = 'none';
    }
  }
}

// Event Listeners Setup
function setupEventListeners() {
  // Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const parsePasteBtn = document.getElementById('parsePasteBtn');
  const pasteArea = document.getElementById('pasteArea');
  
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const categoryFilter = document.getElementById('categoryFilter');
  const statusFilter = document.getElementById('statusFilter');
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');
  
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const printReportBtn = document.getElementById('printReportBtn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');

  // Drag & Drop
  if (dropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      }, false);
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    });
  }

  // File Input
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    });
  }

  // Parse Pasted Text
  if (parsePasteBtn && pasteArea) {
    parsePasteBtn.addEventListener('click', () => {
      const text = pasteArea.value.trim();
      if (!text) {
        alert('Please paste some transaction text first!');
        return;
      }
      showLoader('Parsing pasted text...', 'Applying regex parsers...');
      setTimeout(() => {
        try {
          let parsed = parsePhonePeText(text);
          if (parsed.length === 0) {
            parsed = parseGeneralStatement(text);
          }
          if (parsed.length === 0) {
            alert('Could not find any transactions in the pasted text. Try copying entire rows from your transaction statement.');
            hideLoader();
            return;
          }
          transactionsData = parsed;
          updateDashboard();
          hideLoader();
        } catch (err) {
          console.error(err);
          alert('Failed to parse text. Please check the structure of your pasted content.');
          hideLoader();
        }
      }, 300);
    });
  }



  // Dashboard Filters & Search
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentPage = 1;
      applyFilters();
    });
  }

  [typeFilter, categoryFilter, statusFilter].forEach(filter => {
    if (filter) {
      filter.addEventListener('change', () => {
        currentPage = 1;
        applyFilters();
      });
    }
  });

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (typeFilter) typeFilter.value = 'ALL';
      if (categoryFilter) categoryFilter.value = 'ALL';
      if (statusFilter) statusFilter.value = 'ALL';
      currentSortColumn = 'date';
      currentSortDirection = 'desc';
      updateSortIcons();
      currentPage = 1;
      applyFilters();
    });
  }

  // Sort Headers
  const dateHeader = document.getElementById('dateHeader');
  const amountHeader = document.getElementById('amountHeader');

  if (dateHeader) {
    dateHeader.addEventListener('click', () => {
      toggleSort('date');
    });
  }

  if (amountHeader) {
    amountHeader.addEventListener('click', () => {
      toggleSort('amount');
    });
  }

  // Pagination
  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      const maxPage = Math.ceil(filteredData.length / rowsPerPage);
      if (currentPage < maxPage) {
        currentPage++;
        renderTable();
      }
    });
  }

  // View Toggle Listeners
  const viewListBtn = document.getElementById('viewListBtn');
  const viewMonthBtn = document.getElementById('viewMonthBtn');
  const listViewContainer = document.getElementById('listViewContainer');
  const monthViewContainer = document.getElementById('monthViewContainer');

  if (viewListBtn && viewMonthBtn && listViewContainer && monthViewContainer) {
    viewListBtn.addEventListener('click', () => {
      viewListBtn.className = 'btn btn-primary';
      viewMonthBtn.className = 'btn btn-secondary';
      listViewContainer.style.display = 'block';
      monthViewContainer.style.display = 'none';
    });

    viewMonthBtn.addEventListener('click', () => {
      viewMonthBtn.className = 'btn btn-primary';
      viewListBtn.className = 'btn btn-secondary';
      listViewContainer.style.display = 'none';
      monthViewContainer.style.display = 'block';
      renderMonthView();
    });
  }

  // Exports
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', exportToCsv);
  }

  if (printReportBtn) {
    printReportBtn.addEventListener('click', () => {
      window.print();
    });
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }
}

// Show / Hide Loader
function showLoader(title, subtitle) {
  const overlay = document.getElementById('loaderOverlay');
  const lText = document.getElementById('loaderText');
  const lSub = document.getElementById('loaderSubText');
  if (overlay) {
    if (title) lText.textContent = title;
    if (subtitle) lSub.textContent = subtitle;
    overlay.classList.add('active');
  }
}

function hideLoader() {
  const overlay = document.getElementById('loaderOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

// File Handler (Dispatches to PDF or CSV parser)
function handleFile(file) {
  console.log('handleFile called with:', file.name, 'size:', file.size);
  const extension = file.name.split('.').pop().toLowerCase();
  
  if (extension === 'pdf') {
    showLoader('Reading PhonePe Statement PDF...', 'Extracting textual content page by page...');
    parsePDF(file);
  } else if (extension === 'csv') {
    showLoader('Reading CSV Statement...', 'Parsing columns and matching rows...');
    parseCSV(file);
  } else {
    console.warn('Invalid file format:', extension);
    alert('Invalid file format. Please upload a PhonePe PDF statement or a CSV file.');
  }
}

// Client Side PDF Parser using PDF.js
function parsePDF(file) {
  console.log('parsePDF starting for file:', file.name);
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      console.log('FileReader loaded the file buffer.');
      const typedarray = new Uint8Array(e.target.result);
      console.log('TypedArray length:', typedarray.length);
      const pdf = await window.pdfjsLib.getDocument({ data: typedarray }).promise;
      console.log('PDF loaded successfully. Number of pages:', pdf.numPages);
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        console.log('Extracting text from page:', i);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = getSortedTextFromPageContent(textContent);
        fullText += pageText + '\n';
      }
      
      console.log('Full extracted text length:', fullText.length);
      let parsed = parsePhonePeText(fullText);
      console.log('PhonePe parser parsed transactions:', parsed.length);
      if (parsed.length === 0) {
        console.log('Calling general statement parser...');
        parsed = parseGeneralStatement(fullText);
        console.log('General parser parsed transactions:', parsed.length);
      }
      if (parsed.length === 0) {
        console.warn('No transactions parsed from the text.');
        alert('Could not find any transactions in the statement PDF. Please verify it is a valid PhonePe or bank statement (HDFC, ICICI, SBI, etc.) and is not password-protected.');
        hideLoader();
        return;
      }
      
      transactionsData = parsed;
      console.log('Updating dashboard with parsed transactions:', transactionsData.length);
      updateDashboard();
      hideLoader();
    } catch (err) {
      console.error('Error in reader.onload:', err);
      alert('Error parsing statement PDF. Please ensure the file is not corrupted or protected.');
      hideLoader();
    }
  };
  reader.onerror = function(err) {
    console.error('FileReader error:', err);
  };
  reader.readAsArrayBuffer(file);
}

// CSV Parser
function parseCSV(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const text = e.target.result;
      const parsed = parseCsvText(text);
      if (parsed.length === 0) {
        alert('Could not find any valid transactions in the CSV. Check the column layouts.');
        hideLoader();
        return;
      }
      transactionsData = parsed;
      updateDashboard();
      hideLoader();
    } catch (err) {
      console.error(err);
      alert('Failed to parse CSV file.');
      hideLoader();
    }
  };
  reader.readAsText(file);
}

// Parsing CSV helper
function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];
  
  // Simple CSV line splitter that respects quotes
  const splitCsvLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitCsvLine(lines[0]);
  let dataLines = lines.slice(1);
  
  // Detect header index mappings
  let dateIdx = -1, descIdx = -1, typeIdx = -1, amountIdx = -1, statusIdx = -1, idIdx = -1, utrIdx = -1;
  
  headers.forEach((h, idx) => {
    const val = h.toLowerCase();
    if (val.includes('date') || val.includes('time')) dateIdx = idx;
    else if (val.includes('description') || val.includes('merchant') || val.includes('particular') || val.includes('remark')) descIdx = idx;
    else if (val.includes('type') || val.includes('direction')) typeIdx = idx;
    else if (val.includes('amount') || val.includes('value') || val.includes('txn amt')) amountIdx = idx;
    else if (val.includes('status') || val.includes('state')) statusIdx = idx;
    else if (val.includes('id') || val.includes('txn id') || val.includes('reference')) idIdx = idx;
    else if (val.includes('utr')) utrIdx = idx;
  });

  // Fallbacks if headers not detected
  if (dateIdx === -1) dateIdx = 0;
  if (descIdx === -1) descIdx = 1;
  if (amountIdx === -1) amountIdx = 2;
  if (typeIdx === -1) typeIdx = 3;
  if (statusIdx === -1) statusIdx = 4;
  if (idIdx === -1) idIdx = 5;
  if (utrIdx === -1) utrIdx = 6;

  const results = [];
  dataLines.forEach((line, index) => {
    const cols = splitCsvLine(line);
    if (cols.length <= Math.max(dateIdx, descIdx, amountIdx)) return;

    const rawAmt = cols[amountIdx] || '0';
    const amount = parseFloat(rawAmt.replace(/[^0-9.]/g, '')) || 0.0;
    
    let type = 'DEBIT';
    if (typeIdx < cols.length && cols[typeIdx]) {
      const typeVal = cols[typeIdx].toUpperCase();
      if (typeVal.includes('CREDIT') || typeVal.includes('IN') || typeVal.includes('RECEIVE')) {
        type = 'CREDIT';
      }
    } else {
      // Fallback: Check if description has keywords or amount is positive
      if (rawAmt.includes('+') || cols[descIdx]?.toLowerCase().includes('received')) {
        type = 'CREDIT';
      }
    }

    let status = 'SUCCESS';
    if (statusIdx < cols.length && cols[statusIdx]) {
      const statusVal = cols[statusIdx].toUpperCase();
      if (statusVal.includes('FAIL') || statusVal.includes('DECLINED')) status = 'FAILED';
      else if (statusVal.includes('PEND') || statusVal.includes('PROCESS')) status = 'PENDING';
    }

    const description = cols[descIdx] || 'UPI Transaction';
    const date = cols[dateIdx] || 'Unknown Date';
    const id = (idIdx < cols.length && cols[idIdx]) ? cols[idIdx] : `TXN-CSV-${index}-${Date.now()}`;
    const utr = (utrIdx < cols.length && cols[utrIdx]) ? cols[utrIdx] : '';

    results.push({
      id: id,
      date: date,
      description: description,
      type: type,
      amount: amount,
      status: status,
      utr: utr,
      category: categorizeTransaction(description, type)
    });
  });

  return results;
}

// Smart Categorization Engine
function categorizeTransaction(description, type) {
  const desc = description.toLowerCase();
  
  if (type === 'CREDIT') {
    if (desc.includes('cashback') || desc.includes('cash back') || desc.includes('pp cashback')) return 'Cashback & Refunds';
    if (desc.includes('refund') || desc.includes('returned') || desc.includes('flipkart refund') || desc.includes('amazon refund')) return 'Cashback & Refunds';
    return 'P2P'; // credits default to peer transfer
  }
  
  // Debits Categorization
  if (desc.includes('swiggy') || desc.includes('zomato') || desc.includes('restaurant') || desc.includes('food') || desc.includes('cafe') || desc.includes('dominos') || desc.includes('pizza') || desc.includes('starbucks') || desc.includes('eats') || desc.includes('bakery') || desc.includes('canteen') || desc.includes('tea') || desc.includes('coffee') || desc.includes('hotspot') || desc.includes('sweets') || desc.includes('hotel') || desc.includes('dhaba') || desc.includes('kitchen') || desc.includes('dining') || desc.includes('biryani') || desc.includes('burger') || desc.includes('bakes') || desc.includes('juice') || desc.includes('mess') || desc.includes('snack')) {
    return 'Food & Dining';
  }
  
  if (desc.includes('amazon') || desc.includes('flipkart') || desc.includes('myntra') || desc.includes('meesho') || desc.includes('grocery') || desc.includes('supermarket') || desc.includes('mart') || desc.includes('store') || desc.includes('retail') || desc.includes('decathlon') || desc.includes('shopping') || desc.includes('reliance') || desc.includes('d-mart') || desc.includes('jiomart') || desc.includes('blinkit') || desc.includes('zepto') || desc.includes('instamart') || desc.includes('mall') || desc.includes('shop') || desc.includes('pvt ltd') || desc.includes('private limited') || desc.includes('rentmojo') || desc.includes('super mark') || desc.includes('supermark') || desc.includes('market') || desc.includes('provision') || desc.includes('enterprise') || desc.includes('agency') || desc.includes('agencies') || desc.includes('distributor') || desc.includes('silks') || desc.includes('garment') || desc.includes('textile') || desc.includes('clothing') || desc.includes('boutique') || desc.includes('jewel') || desc.includes('pharmacy') || desc.includes('medical') || desc.includes('medicals') || desc.includes('chemist') || desc.includes('opticals')) {
    return 'Shopping & Merchant';
  }
  
  if (desc.includes('recharge') || desc.includes('electricity') || desc.includes('water bill') || desc.includes('gas') || desc.includes('broadband') || desc.includes('wifi') || desc.includes('dth') || desc.includes('jio') || desc.includes('airtel') || desc.includes('vi') || desc.includes('bsnl') || desc.includes('bescom') || desc.includes('tata play') || desc.includes('bill payment') || desc.includes('utility') || desc.includes('postpaid') || desc.includes('insurance') || desc.includes('lic') || desc.includes('tax') || desc.includes('challan')) {
    return 'Bills & Recharges';
  }
  
  if (desc.includes('mutual fund') || desc.includes('groww') || desc.includes('zerodha') || desc.includes('sip') || desc.includes('nps') || desc.includes('stocks') || desc.includes('gold') || desc.includes('investment') || desc.includes('angelone') || desc.includes('indmoney') || desc.includes('securities') || desc.includes('broker') || desc.includes('insurance premium')) {
    return 'Investments & Finance';
  }
  
  if (desc.includes('uber') || desc.includes('ola') || desc.includes('rapido') || desc.includes('metro') || desc.includes('irctc') || desc.includes('rail') || desc.includes('flight') || desc.includes('makemytrip') || desc.includes('yatra') || desc.includes('fuel') || desc.includes('petrol') || desc.includes('shell') || desc.includes('hpcl') || desc.includes('iocl') || desc.includes('bpcl') || desc.includes('cab') || desc.includes('auto') || desc.includes('toll') || desc.includes('fastag') || desc.includes('commute') || desc.includes('travel') || desc.includes('transport') || desc.includes('bus') || desc.includes('travels') || desc.includes('air') || desc.includes('railway') || desc.includes('parking') || desc.includes('fill')) {
    return 'Travel & Commute';
  }
  
  if (desc.includes('refund') || desc.includes('cashback')) {
    return 'Cashback & Refunds';
  }
  
  // Default debits that look like P2P / Transfers:
  // If it contains terms like 'transaction', 'transfer', 'upi/', 'imps/', 'neft/', 'rtgs/', 'tfr', 'ft', 'paid to', 'sent to', 'payment to', or name keywords
  if (desc.includes('paid to') || 
      desc.includes('transfer to') || 
      desc.includes('sent to') || 
      desc.includes('self transfer') || 
      desc.includes('to:') || 
      desc.includes('payment to') ||
      desc.includes('transaction') ||
      desc.includes('transfer') ||
      desc.includes('tfr') ||
      desc.includes('ft') ||
      desc.includes('upi') ||
      desc.includes('imps') ||
      desc.includes('neft') ||
      desc.includes('rtgs') ||
      desc.includes('rent') ||
      desc.includes('owner') ||
      desc.includes('house') ||
      // Check common Indian names/tokens in description
      /\b(kumar|singh|sharma|patel|verma|gupta|yadav|latha|aravalli|jayabalan|sathish|raj|amit|rahul|priya|arjun|neha|anil|sunil|sanjay|vijay|deepak|sandeep|rajesh|ram|krishna)\b/.test(desc)) {
    return 'P2P';
  }
  
  // If the description consists of two or three words without numbers (likely a person's name)
  const words = desc.split(' ').filter(w => w.length > 1);
  if (words.length >= 2 && words.length <= 4 && !/\d/.test(desc)) {
    return 'P2P';
  }
  
  return 'Others';
}

// Smart Merchant Name Extraction with High-Accruate Cleansing
function extractCleanMerchantName(desc) {
  let name = desc.trim();
  
  // 1. Remove standard transaction prefixes
  name = name.replace(/^UPI-/, '');
  name = name.replace(/^POS\s+.*?\s+\d{2}[A-Z]{3}\d{1}/i, 'POS Purchase'); // POS card purchases
  name = name.replace(/^POS\s+/i, 'POS Purchase ');
  name = name.replace(/^NEFT\s*-\s*/i, '');
  name = name.replace(/^RTGS\s*-\s*/i, '');
  name = name.replace(/^IMPS\s*-\s*/i, '');
  name = name.replace(/^IB\s+BILLPAY\s*-\s*/i, '');
  
  // 2. Identify major canonical brands and return clean versions
  const nameLower = name.toLowerCase();
  if (nameLower.includes('swiggy')) return 'Swiggy';
  if (nameLower.includes('zomato')) return 'Zomato';
  if (nameLower.includes('amazon')) return 'Amazon';
  if (nameLower.includes('flipkart')) return 'Flipkart';
  if (nameLower.includes('uber')) return 'Uber';
  if (nameLower.includes('ola cab') || nameLower.includes('ola auto')) return 'Ola';
  if (nameLower.includes('rapido')) return 'Rapido';
  if (nameLower.includes('jio')) return 'Jio';
  if (nameLower.includes('airtel')) return 'Airtel';
  if (nameLower.includes('bsnl')) return 'BSNL';
  if (nameLower.includes('groww')) return 'Groww';
  if (nameLower.includes('zerodha')) return 'Zerodha';
  if (nameLower.includes('netflix')) return 'Netflix';
  if (nameLower.includes('hotstar')) return 'Disney+ Hotstar';
  
  // 3. Remove trailing payment gateway suffixes and transaction details
  // Remove trailing email domains (e.g. name@axisbank, name@ybl)
  name = name.replace(/@[a-zA-Z0-9\-\.]+\b/g, '');
  
  // Remove standard HDFC/UPI merchant/bank suffixes
  name = name.replace(/(?:\b(HDFCBANK|HDFC0MERUPI|YESB0MCHUPI|YESB0PTMUPI|YESB0YBLUPI|OKBIZAXIS|OKICICI|OKSBI|AXISBANK|UTIB0000553|UTIB000SETU|KKBK0JPUPIA|SBIN0070472|SBIN0007993|CIUB000104|FDRL0001382|IBKL0000005|SIBL0000338|IDIB000T130|IOBA0001576|KVBL0001217|KVBL0001188|KVBL0001282)\b.*)/gi, '');
  
  // Remove reference / payment strings
  name = name.replace(/(?:-PAYMENT FROM PHONE|-PAYMENT FROM PHO|-PAYMENT FROM PH|-PAYMENT FR OM|PAYMENT FROM|PAYMENT TO|PAYMENT FOR.*)/gi, '');
  name = name.replace(/(?:\b(GPAY|PAYTMQR|BHARATPE|EASEBUZZ|BILLDESK|PINELABS|SETU|PAYU)\b.*)/gi, '');
  
  // Remove trailing numbers (reference codes, card digits, dates, timestamps)
  name = name.replace(/\b\d{4,20}\b/g, '');
  name = name.replace(/\b\d{2}[A-Z]{3}\d{1,4}\b/g, ''); // dates like 12MAY2
  name = name.replace(/\b\d{2}:\d{2}(?::\d{2})?\b/g, ''); // time stamps
  
  // Remove extra characters, double spaces, and clean ends
  name = name
    .replace(/[^a-zA-Z0-9\s\-\.\&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
    
  // Strip trailing dashes/dots
  name = name.replace(/[\-\.\s]+$/, '').replace(/^[\-\.\s]+/, '').trim();
  
  // If result is empty or too short, return fallback
  if (!name || name.length < 3) {
    return 'Other Merchant';
  }
  
  // Title case formatting helper
  return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// Dual-layered regex text parser
function parsePhonePeText(text) {
  // Layer 1: Anchor on Transaction ID (e.g. T231212... or T[a-zA-Z0-9]{20,24})
  const txIdRegex = /\b(T[a-zA-Z0-9]{18,24})\b/g;
  const matches = [];
  let match;
  
  while ((match = txIdRegex.exec(text)) !== null) {
    matches.push({
      id: match[1],
      index: match.index
    });
  }

  // Sorting matches chronologically by coordinate position in string
  matches.sort((a, b) => a.index - b.index);

  const transactions = [];

  if (matches.length > 0) {
    // We found anchored IDs. Use sliding windows around these ID anchors
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      // Window range: 160 characters before, 220 characters after
      const startIdx = i === 0 ? 0 : Math.max(current.index - 160, matches[i-1].index + matches[i-1].id.length);
      const endIdx = i === matches.length - 1 ? text.length : Math.min(current.index + 220, matches[i+1].index);
      const windowText = text.substring(startIdx, endIdx);

      // Amount extraction (₹ / Rs / INR + numbers)
      const amountRegex = /(?:₹|Rs\.?|INR)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi;
      let amountMatch = amountRegex.exec(windowText);
      let amount = 0.0;
      if (amountMatch) {
        amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      } else {
        // Broad search for float numbers with decimals if currency symbol missing
        const fallbackAmtRegex = /\b(\d{1,6}\.\d{2})\b/;
        const fallbackAmtMatch = fallbackAmtRegex.exec(windowText);
        amount = fallbackAmtMatch ? parseFloat(fallbackAmtMatch[1]) : 0.0;
      }

      // Debit or Credit
      let type = 'DEBIT';
      if (/credit/i.test(windowText) || /received/i.test(windowText) || /refund/i.test(windowText) || /cashback/i.test(windowText)) {
        type = 'CREDIT';
      } else if (/debit/i.test(windowText) || /paid/i.test(windowText) || /sent to/i.test(windowText)) {
        type = 'DEBIT';
      }

      // Status
      let status = 'SUCCESS';
      if (/failed/i.test(windowText) || /declined/i.test(windowText) || /unsuccessful/i.test(windowText)) {
        status = 'FAILED';
      } else if (/pending/i.test(windowText) || /processing/i.test(windowText)) {
        status = 'PENDING';
      }

      // UTR / Reference number (12 digits)
      const utrRegex = /\b(\d{12})\b/;
      const utrMatch = utrRegex.exec(windowText);
      const utr = utrMatch ? utrMatch[1] : '';

      // Date & Time (e.g. Dec 12, 2023, 08:32 PM or similar formats)
      // Supports formats like "Dec 12, 2023, 08:32 PM" or "12 Dec 2023 08:32 PM" or "12-12-2023"
      const dateRegex = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}(?:,?\s+\d{1,2}:\d{2}\s+(?:AM|PM))?)/i;
      const dateMatch = dateRegex.exec(windowText);
      let dateStr = '';
      if (dateMatch) {
        dateStr = dateMatch[1];
      } else {
        const dateRegex2 = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}(?:\s+\d{1,2}:\d{2}\s+(?:AM|PM))?)/i;
        const dateMatch2 = dateRegex2.exec(windowText);
        if (dateMatch2) {
          dateStr = dateMatch2[1];
        } else {
          // General date digit match (DD/MM/YYYY or YYYY-MM-DD)
          const dateRegex3 = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?)/;
          const dateMatch3 = dateRegex3.exec(windowText);
          dateStr = dateMatch3 ? dateMatch3[1] : 'Unknown Date';
        }
      }

      // Description / Merchant Name
      let description = '';
      
      // Clean up text in window to extract descriptive sentences
      let cleanText = windowText
        .replace(current.id, '') // Remove Tx ID
        .replace(utr, '') // Remove UTR
        .replace(/(?:₹|Rs\.?|INR)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi, '') // Remove amount
        .replace(/debit|credit|success|failed|pending/gi, '') // Remove statuses
        .replace(/[\r\n\t]+/g, ' ') // Strip newlines
        .replace(/\s+/g, ' ')
        .trim();

      // Look for target sentences e.g., "Paid to Swiggy", "Received from Rahul", "Transfer to Neha"
      const descPatterns = [
        /(?:Paid to|Sent to|Transfer to|Payment to)\s+([^,.-]+)/i,
        /(?:Received from|Refund from|Cashback from)\s+([^,.-]+)/i,
        /(?:Recharge of|Bill payment for)\s+([^,.-]+)/i
      ];

      for (const pattern of descPatterns) {
        const descMatch = pattern.exec(cleanText);
        if (descMatch && descMatch[1].trim()) {
          description = descMatch[1].trim();
          break;
        }
      }

      if (!description) {
        // Fallback: take a snippet of the window text before the transaction ID
        const indexInWindow = windowText.indexOf(current.id);
        const beforeText = indexInWindow > 0 ? windowText.substring(0, indexInWindow) : windowText;
        const words = beforeText
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .split(/\s+/)
          .filter(w => w.length > 2 && !/^\d+$/.test(w) && !/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i.test(w));
        
        description = words.slice(-3).join(' '); // Take last 3 words
      }

      description = description || 'UPI Transaction';
      
      // Strip leaking labels
      description = description
        .replace(/\b(UTR|Txn|Ref|ID|Date|Time|UPI|Status|Amt|Amount|To|From|No)\b.*/gi, '')
        .trim();
      
      if (description.length > 50) {
        description = description.substring(0, 47) + '...';
      }

      // Final sanitization of names
      description = description.replace(/^\s*(to|from|for|of|at)\s+/i, '').trim();

      transactions.push({
        id: current.id,
        date: dateStr,
        description: description || 'UPI Payment',
        type: type,
        amount: amount,
        status: status,
        utr: utr,
        category: categorizeTransaction(description || 'UPI Payment', type)
      });
    }
  } else {
    // Layer 2 Fallback: If no transaction IDs, parse by Dates as anchors
    // Useful for copy-pasted text from history pages that omit IDs
    const dateAnchorRegex = /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|[A-Za-z]{3}\s+\d{1,2},\s+\d{4})\b/gi;
    const dateMatches = [];
    let dateMatch;
    
    while ((dateMatch = dateAnchorRegex.exec(text)) !== null) {
      dateMatches.push({
        date: dateMatch[1],
        index: dateMatch.index
      });
    }

    if (dateMatches.length > 0) {
      for (let i = 0; i < dateMatches.length; i++) {
        const current = dateMatches[i];
        const startIdx = current.index;
        const endIdx = i === dateMatches.length - 1 ? text.length : dateMatches[i+1].index;
        const windowText = text.substring(startIdx, endIdx);

        // Find amount
        const amountRegex = /(?:₹|Rs\.?|INR)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi;
        const amountMatch = amountRegex.exec(windowText);
        const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0.0;

        if (amount === 0.0) continue; // Skip lines that aren't financial items

        // Type
        let type = 'DEBIT';
        if (/credit|received|refund|cashback/i.test(windowText)) {
          type = 'CREDIT';
        }

        // Status
        let status = 'SUCCESS';
        if (/failed|declined/i.test(windowText)) status = 'FAILED';

        // Description
        let description = windowText
          .replace(current.date, '')
          .replace(/(?:₹|Rs\.?|INR)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi, '')
          .replace(/debit|credit|success|failed/gi, '')
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        description = description.replace(/^\s*(paid to|received from|transfer to|sent to|payment for)\s+/i, '');
        if (description.length > 55) {
          description = description.substring(0, 52) + '...';
        }

        const fakeId = `TXN-FLBK-${i}-${Date.now()}`;

        transactions.push({
          id: fakeId,
          date: current.date,
          description: description || 'UPI Payment',
          type: type,
          amount: amount,
          status: status,
          utr: '',
          category: categorizeTransaction(description || 'UPI Payment', type)
        });
      }
    }
  }

  return transactions;
}



// Update Dashboard View (Metrics, Charts, Table)
function updateDashboard() {
  // Toggle Visibility
  document.getElementById('emptyStateSection').style.display = 'none';
  document.getElementById('dashboardContainer').style.display = 'block';

  // Enable Export/Print Buttons
  document.getElementById('exportCsvBtn').removeAttribute('disabled');
  document.getElementById('printReportBtn').removeAttribute('disabled');

  updateSortIcons();
  applyFilters();
}

// Filters implementation
function applyFilters() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  const type = document.getElementById('typeFilter').value;
  const category = document.getElementById('categoryFilter').value;
  const status = document.getElementById('statusFilter').value;

  filteredData = transactionsData.filter(tx => {
    // Search query filter
    const matchesQuery = !query || 
      tx.description.toLowerCase().includes(query) || 
      tx.id.toLowerCase().includes(query) || 
      tx.utr.includes(query);
    
    // Type filter
    const matchesType = type === 'ALL' || tx.type === type;
    
    // Category filter
    const matchesCategory = category === 'ALL' || tx.category === category;
    
    // Status filter
    const matchesStatus = status === 'ALL' || tx.status === status;

    return matchesQuery && matchesType && matchesCategory && matchesStatus;
  });

  currentPage = 1;

  // Sort filteredData based on sorting state
  filteredData.sort((a, b) => {
    let comparison = 0;
    if (currentSortColumn === 'amount') {
      comparison = a.amount - b.amount;
    } else if (currentSortColumn === 'date') {
      const dateA = parseDateString(a.date);
      const dateB = parseDateString(b.date);
      const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
      const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
      comparison = timeA - timeB;
    }
    return currentSortDirection === 'asc' ? comparison : -comparison;
  });
  
  // Re-calculate Metrics based on unfiltered parsed data (or filtered? usually metrics show overall summary of the uploaded statement)
  // Let's show metrics based on ALL loaded transactions, which makes sense for the uploaded statement.
  // Actually, let's calculate metrics on the active set, but it is better to calculate it on all success transactions of the current statement.
  // Let's do ALL SUCCESS loaded transactions for the standard values, so filters only affect the list view and category breakdown charts.
  // Wait! Charts should reflect filtered values so they are interactive! Yes!
  // Let's calculate standard stats based on the complete loaded data (excluding failed), and filters will update the charts and table.
  calculateMetrics(transactionsData);
  
  // Update Charts (reflecting filters, which feels highly responsive and dynamic!)
  renderCharts(filteredData);
  
  // Render Top Merchants Grid
  renderTopMerchants(filteredData);
  
  // Render Table
  renderTable();

  // Update Month view if active
  const monthViewContainer = document.getElementById('monthViewContainer');
  if (monthViewContainer && monthViewContainer.style.display === 'block') {
    renderMonthView();
  }
}

// Calculate Metrics
function calculateMetrics(data) {
  let totalDebit = 0;
  let totalCredit = 0;
  let debitCount = 0;
  let creditCount = 0;
  let successCount = 0;
  let failedCount = 0;

  data.forEach(tx => {
    if (tx.status === 'SUCCESS') {
      successCount++;
      if (tx.type === 'DEBIT') {
        totalDebit += tx.amount;
        debitCount++;
      } else {
        totalCredit += tx.amount;
        creditCount++;
      }
    } else {
      failedCount++;
    }
  });

  const netBalance = totalCredit - totalDebit;
  const totalSuccessTransactions = successCount + failedCount;
  const successRate = totalSuccessTransactions > 0 ? Math.round((successCount / totalSuccessTransactions) * 100) : 100;

  // Render values
  document.getElementById('metricDebitVal').textContent = formatCurrency(totalDebit);
  document.getElementById('metricDebitCount').textContent = `${debitCount} transactions`;

  document.getElementById('metricCreditVal').textContent = formatCurrency(totalCredit);
  document.getElementById('metricCreditCount').textContent = `${creditCount} transactions`;

  const balanceEl = document.getElementById('metricBalanceVal');
  balanceEl.textContent = formatCurrency(netBalance);
  if (netBalance >= 0) {
    balanceEl.style.color = 'var(--success)';
  } else {
    balanceEl.style.color = '#f87171'; // light red
  }

  document.getElementById('metricSuccessVal').textContent = `${successRate}%`;
  document.getElementById('metricSuccessCount').textContent = `${failedCount} failed transactions`;
}

// Currency Formatter
function formatCurrency(val) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(val);
}

// Render dynamic charts using Chart.js
function renderCharts(data) {
  // Theme color resolutions
  const isLightTheme = document.body.classList.contains('light-theme');
  const gridColor = isLightTheme ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.05)';
  const labelColor = isLightTheme ? '#475569' : '#94a3b8';
  const titleColor = isLightTheme ? '#0f172a' : '#f8fafc';
  const doughnutBorder = isLightTheme ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)';

  // Aggregate data for category chart (Success debits only!)
  const categoriesSum = {};
  Object.keys(CATEGORIES).forEach(cat => {
    categoriesSum[cat] = 0;
  });

  data.forEach(tx => {
    if (tx.status === 'SUCCESS' && tx.type === 'DEBIT') {
      if (categoriesSum[tx.category] !== undefined) {
        categoriesSum[tx.category] += tx.amount;
      } else {
        categoriesSum['Others'] += tx.amount;
      }
    }
  });

  const categoryLabels = Object.keys(CATEGORIES).map(key => CATEGORIES[key].label);
  const categoryData = Object.keys(CATEGORIES).map(key => categoriesSum[key]);
  const categoryColors = Object.keys(CATEGORIES).map(key => CATEGORIES[key].color);

  // 1. Donut Chart
  const ctxCat = document.getElementById('categoryChart').getContext('2d');
  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  categoryChartInstance = new Chart(ctxCat, {
    type: 'doughnut',
    data: {
      labels: categoryLabels,
      datasets: [{
        data: categoryData,
        backgroundColor: categoryColors,
        borderWidth: 1,
        borderColor: doughnutBorder
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, activeElements) => {
        if (activeElements.length > 0) {
          const firstElement = activeElements[0];
          const index = firstElement.index;
          const label = categoryChartInstance.data.labels[index];
          filterByCategoryLabel(label);
        }
      },
      plugins: {
        legend: {
          display: false // We use our custom styled legends below the canvas!
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw;
              return ` ${context.label}: ${formatCurrency(val)}`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });

  // Render Custom Legends
  const legendContainer = document.getElementById('categoryLegend');
  legendContainer.innerHTML = '';
  Object.keys(CATEGORIES).forEach(key => {
    const sum = categoriesSum[key];
    if (sum > 0) {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <span class="legend-color" style="background-color: ${CATEGORIES[key].color}"></span>
        <span>${key}: <strong>${formatCurrency(sum)}</strong></span>
      `;
      item.addEventListener('click', () => {
        filterByCategoryLabel(key);
      });
      legendContainer.appendChild(item);
    }
  });

  // 2. Trend Chart (Daily debits and credits)
  const dailyData = {};
  
  data.forEach(tx => {
    if (tx.status !== 'SUCCESS') return; // Skip failed
    
    const dateObj = parseDateString(tx.date);
    if (isNaN(dateObj.getTime())) return;
    
    // Standardize key as YYYY-MM-DD
    const standardKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    
    if (!dailyData[standardKey]) {
      dailyData[standardKey] = { 
        debit: 0, 
        credit: 0, 
        sortKey: dateObj,
        label: `${String(dateObj.getDate()).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dateObj.getMonth()]}`
      };
    }
    
    if (tx.type === 'DEBIT') {
      dailyData[standardKey].debit += tx.amount;
    } else {
      dailyData[standardKey].credit += tx.amount;
    }
  });

  // Sort dates chronologically
  const sortedKeys = Object.keys(dailyData).sort((a, b) => dailyData[a].sortKey - dailyData[b].sortKey);
  const trendLabels = sortedKeys.map(k => dailyData[k].label);
  const trendDebits = sortedKeys.map(k => dailyData[k].debit);
  const trendCredits = sortedKeys.map(k => dailyData[k].credit);

  const ctxTrend = document.getElementById('trendChart').getContext('2d');
  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  trendChartInstance = new Chart(ctxTrend, {
    type: 'line',
    data: {
      labels: trendLabels,
      datasets: [
        {
          label: 'Total Spent (Debit)',
          data: trendDebits,
          borderColor: '#fca5a5', // light red
          backgroundColor: 'rgba(239, 68, 68, 0.05)',
          fill: true,
          tension: 0.3,
          borderWidth: 2
        },
        {
          label: 'Total Received (Credit)',
          data: trendCredits,
          borderColor: '#6ee7b7', // light green
          backgroundColor: 'rgba(16, 185, 129, 0.05)',
          fill: true,
          tension: 0.3,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: {
            color: gridColor
          },
          ticks: {
            color: labelColor,
            font: { family: 'var(--font-primary)' }
          }
        },
        y: {
          grid: {
            color: gridColor
          },
          ticks: {
            color: labelColor,
            font: { family: 'var(--font-primary)' },
            callback: function(value) {
              return '₹' + value;
            }
          }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: titleColor,
            font: { family: 'var(--font-primary)', size: 12 }
          }
        }
      }
    }
  });
}

// Render Top Spending Merchants Grid
function renderTopMerchants(data) {
  const container = document.getElementById('topMerchantsSection');
  const grid = document.getElementById('topMerchantsGrid');
  
  if (!container || !grid) return;
  
  // Aggregate successful debits by clean merchant name
  const merchantSums = {};
  const merchantCounts = {};
  const merchantCategories = {};
  let totalDebitSpend = 0;
  
  data.forEach(tx => {
    if (tx.status === 'SUCCESS' && tx.type === 'DEBIT') {
      const cleanName = extractCleanMerchantName(tx.description);
      
      merchantSums[cleanName] = (merchantSums[cleanName] || 0) + tx.amount;
      merchantCounts[cleanName] = (merchantCounts[cleanName] || 0) + 1;
      merchantCategories[cleanName] = tx.category; // Keep the last matched category
      totalDebitSpend += tx.amount;
    }
  });
  
  // Sort merchants by total spend descending
  const sortedMerchants = Object.keys(merchantSums)
    .map(name => ({
      name: name,
      sum: merchantSums[name],
      count: merchantCounts[name],
      category: merchantCategories[name]
    }))
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 5); // Take top 5
  
  if (sortedMerchants.length === 0 || totalDebitSpend === 0) {
    container.style.display = 'none';
    grid.innerHTML = '';
    return;
  }
  
  container.style.display = 'block';
  grid.innerHTML = '';
  
  sortedMerchants.forEach(m => {
    const percentage = ((m.sum / totalDebitSpend) * 100).toFixed(1);
    
    // Choose Lucide icon based on category
    let iconClass = 'others';
    let iconName = 'shopping-bag';
    
    if (m.category === 'Food & Dining') {
      iconClass = 'food';
      iconName = 'utensils';
    } else if (m.category === 'Shopping & Merchant') {
      iconClass = 'shopping';
      iconName = 'shopping-bag';
    } else if (m.category === 'Bills & Recharges') {
      iconClass = 'bills';
      iconName = 'credit-card';
    } else if (m.category === 'Investments & Finance') {
      iconClass = 'investments';
      iconName = 'trending-up';
    } else if (m.category === 'Travel & Commute') {
      iconClass = 'travel';
      iconName = 'car';
    } else if (m.category === 'P2P') {
      iconClass = 'p2p';
      iconName = 'users';
    }
    
    const card = document.createElement('div');
    card.className = 'merchant-card';
    card.innerHTML = `
      <div class="merchant-card-header">
        <div class="merchant-icon-box ${iconClass}">
          <i data-lucide="${iconName}" style="width: 16px; height: 16px;"></i>
        </div>
        <div class="merchant-info">
          <span class="merchant-name" title="${m.name}">${m.name}</span>
          <span class="merchant-category">${m.category}</span>
        </div>
      </div>
      <div class="merchant-stats">
        <span class="merchant-spend">${formatCurrency(m.sum)}</span>
        <span class="merchant-count">${m.count} payment${m.count > 1 ? 's' : ''}</span>
      </div>
      <div class="merchant-progress-container">
        <div class="merchant-progress-bar-bg">
          <div class="merchant-progress-bar-fill" style="width: ${percentage}%;"></div>
        </div>
        <div class="merchant-percentage">${percentage}% of debit budget</div>
      </div>
    `;
    grid.appendChild(card);
  });
  
  // Initialize icons inside grid
  initLucide();
}

// Filter transactions by Category Label (e.g. from chart clicks or legends)
function filterByCategoryLabel(categoryLabel) {
  // Find key in CATEGORIES where label matches categoryLabel
  const catKey = Object.keys(CATEGORIES).find(key => CATEGORIES[key].label === categoryLabel || key === categoryLabel);
  if (catKey) {
    const filterSelect = document.getElementById('categoryFilter');
    if (filterSelect) {
      filterSelect.value = catKey;
      currentPage = 1;
      applyFilters();
      
      // Scroll to transaction table/list smoothly
      const tableCard = document.querySelector('.transactions-table')?.closest('.card');
      if (tableCard) {
        tableCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }
}

// Render Transactions Table
function renderTable() {
  const tbody = document.getElementById('transactionsTableBody');
  const badgeCount = document.getElementById('transactionCountBadge');
  const paginationText = document.getElementById('paginationText');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  tbody.innerHTML = '';

  badgeCount.textContent = `${filteredData.length} transactions`;

  if (filteredData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 40px;">
          <div style="font-size: 24px; opacity: 0.2; margin-bottom: 8px;">🔍</div>
          <div style="font-weight: 600; color: var(--text-secondary);">No matching transactions found</div>
          <div style="font-size: 12px; color: var(--text-muted);">Adjust your filters or query strings.</div>
        </td>
      </tr>
    `;
    paginationText.textContent = 'Showing 0 of 0 transactions';
    prevBtn.setAttribute('disabled', 'true');
    nextBtn.setAttribute('disabled', 'true');
    return;
  }

  // Paginate
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, filteredData.length);
  const pageItems = filteredData.slice(startIndex, endIndex);

  pageItems.forEach((tx) => {
    const tr = document.createElement('tr');
    
    // Date & Time split
    const dateParts = tx.date.split(', ');
    const displayDate = dateParts[0];
    const displayTime = dateParts[1] ? dateParts.slice(1).join(', ') : '';

    // Status Badge
    let statusClass = 'badge-success';
    if (tx.status === 'FAILED') statusClass = 'badge-failed';
    else if (tx.status === 'PENDING') statusClass = 'badge-pending';

    // Amount color class
    const amtSign = tx.type === 'DEBIT' ? '-' : '+';
    const amtClass = tx.type === 'DEBIT' ? 'debit' : 'credit';

    // Category Selector
    let optionsHtml = '';
    Object.keys(CATEGORIES).forEach(catKey => {
      const isSelected = tx.category === catKey ? 'selected' : '';
      optionsHtml += `<option value="${catKey}" ${isSelected}>${catKey}</option>`;
    });

    tr.innerHTML = `
      <td>
        <div style="font-weight: 500;">${displayDate}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${displayTime}</div>
      </td>
      <td class="tx-description-cell">
        <div class="tx-main-desc">${tx.description}</div>
        <div class="tx-sub-desc">
          ID: ${tx.id} ${tx.utr ? `| UTR: ${tx.utr}` : ''}
        </div>
      </td>
      <td>
        <span class="badge ${statusClass}">${tx.status}</span>
      </td>
      <td>
        <div class="category-dropdown-container">
          <select class="category-badge-select ${CATEGORIES[tx.category]?.cssClass || ''}" onchange="changeTransactionCategory('${tx.id}', this.value)">
            ${optionsHtml}
          </select>
        </div>
      </td>
      <td class="tx-amount ${amtClass}" style="text-align: right;">
        ${amtSign} ${formatCurrency(tx.amount)}
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Update Pagination Controls
  paginationText.textContent = `Showing ${startIndex + 1}-${endIndex} of ${filteredData.length} transactions`;

  if (currentPage > 1) {
    prevBtn.removeAttribute('disabled');
  } else {
    prevBtn.setAttribute('disabled', 'true');
  }

  const maxPage = Math.ceil(filteredData.length / rowsPerPage);
  if (currentPage < maxPage) {
    nextBtn.removeAttribute('disabled');
  } else {
    nextBtn.setAttribute('disabled', 'true');
  }
}

// Category change handler (called inline from select elements in the table)
window.changeTransactionCategory = function(txId, newCategory) {
  // Find transaction
  const tx = transactionsData.find(t => t.id === txId);
  if (tx) {
    tx.category = newCategory;
    
    // Apply changes (maintaining active filters, but updating categories in charts and lists)
    applyFilters();
  }
};

// Export to CSV Function
function exportToCsv() {
  if (transactionsData.length === 0) return;

  const headers = ['Date', 'Transaction ID', 'Description', 'Type', 'Amount', 'Status', 'UTR', 'Category'];
  const csvRows = [headers.join(',')];

  transactionsData.forEach(tx => {
    const values = [
      `"${tx.date}"`,
      `"${tx.id}"`,
      `"${tx.description.replace(/"/g, '""')}"`,
      `"${tx.type}"`,
      tx.amount,
      `"${tx.status}"`,
      `"${tx.utr}"`,
      `"${tx.category}"`
    ];
    csvRows.push(values.join(','));
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `PhonePe_Analyzed_Transactions_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Toggle sorting order
function toggleSort(column) {
  if (currentSortColumn === column) {
    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortColumn = column;
    currentSortDirection = column === 'date' ? 'desc' : 'asc';
  }
  updateSortIcons();
  applyFilters();
}

// Update DOM elements for sort icons using Lucide
function updateSortIcons() {
  const dateHeader = document.getElementById('dateHeader');
  const amountHeader = document.getElementById('amountHeader');
  
  if (!dateHeader || !amountHeader) return;
  
  if (currentSortColumn === 'date') {
    dateHeader.innerHTML = `Date & Time <i data-lucide="${currentSortDirection === 'asc' ? 'chevron-up' : 'chevron-down'}" style="width: 14px; height: 14px; vertical-align: middle; margin-left: 4px;"></i>`;
    amountHeader.innerHTML = `Amount <i data-lucide="chevrons-up-down" style="width: 14px; height: 14px; vertical-align: middle; margin-left: 4px;"></i>`;
  } else if (currentSortColumn === 'amount') {
    dateHeader.innerHTML = `Date & Time <i data-lucide="chevrons-up-down" style="width: 14px; height: 14px; vertical-align: middle; margin-left: 4px;"></i>`;
    amountHeader.innerHTML = `Amount <i data-lucide="${currentSortDirection === 'asc' ? 'chevron-up' : 'chevron-down'}" style="width: 14px; height: 14px; vertical-align: middle; margin-left: 4px;"></i>`;
  }
  
  initLucide();
}

// General Bank Statement Parser (Supporting HDFC, ICICI, SBI etc.)
function parseGeneralStatement(text) {
  const lines = text.split('\n');
  const transactions = [];
  
  // Date regex matching DD/MM/YY or DD/MM/YYYY or DD-MM-YY or DD-MM-YYYY
  const dateRegex = /^(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4})/;
  
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;
    
    // Check if line starts with a date
    const dateMatch = dateRegex.exec(line);
    if (!dateMatch) continue;
    
    const txDate = dateMatch[1];
    
    // Find all decimal floats on this line (e.g. 150.00, 1,250.00)
    // We match numbers with a decimal point and two decimal places
    const amtRegex = /\b(\d+(?:,\d{3})*(?:\.\d{2}))\b/g;
    const amounts = [];
    let amtMatch;
    
    // Get all content after the first date
    const lineContent = line.substring(dateMatch[0].length).trim();
    
    while ((amtMatch = amtRegex.exec(lineContent)) !== null) {
      amounts.push({
        val: parseFloat(amtMatch[1].replace(/,/g, '')),
        index: amtMatch.index,
        raw: amtMatch[1]
      });
    }
    
    if (amounts.length === 0) continue;
    
    // Usually: first amount is transaction amount, last amount is closing balance (if more than 1 amount)
    const amount = amounts[0].val;
    const balance = amounts.length > 1 ? amounts[amounts.length - 1].val : null;
    
    // Extract description: everything between the first date and the first amount
    let rawDescription = lineContent.substring(0, amounts[0].index).trim();
    
    // Clean description: remove secondary dates (Value Date) and reference numbers
    // Remove value date
    const secondaryDateRegex = /\b\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4}\b/g;
    rawDescription = rawDescription.replace(secondaryDateRegex, '');
    
    // Remove reference numbers (sequences of digits >= 10 chars)
    const refNumRegex = /\b\d{10,20}\b/g;
    rawDescription = rawDescription.replace(refNumRegex, '');
    
    // General clean
    let description = rawDescription
      .replace(/debit|credit|cr|dr|success|failed|balance/gi, '')
      .replace(/[^a-zA-Z0-9\s\-\/\.\(\)\#\_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
      
    // Strip leading dashes/slashes/spaces
    description = description.replace(/^[\-\/\.\s\(\)]+/, '').trim();
    
    if (!description || description.length < 3) {
      description = 'Bank Transaction';
    }
    
    if (description.length > 60) {
      description = description.substring(0, 57) + '...';
    }
    
    // Credit vs Debit heuristic based on keywords on this line
    const descLower = line.toLowerCase();
    let isCredit = false;
    
    if (descLower.includes('credit') || 
        descLower.includes(' cr ') || 
        descLower.includes('/cr/') || 
        descLower.includes(' neft cr') || 
        descLower.includes(' imps cr') || 
        descLower.includes(' rtgs cr') || 
        descLower.includes('by transfer') || 
        descLower.includes('by clear') || 
        descLower.startsWith('by ') || 
        descLower.includes('interest') || 
        descLower.includes('refund') || 
        descLower.includes('salary') || 
        descLower.includes('deposit') || 
        descLower.includes('received') || 
        descLower.includes('cashback') || 
        descLower.includes('dividend') || 
        descLower.includes('upi in') || 
        descLower.includes('+') || 
        descLower.includes('inward')) {
      isCredit = true;
    }
    
    if (descLower.includes('card payment') || descLower.includes('payment to') || descLower.includes('dr ') || descLower.includes('/dr/') || descLower.includes('charges')) {
      isCredit = false;
    }
    
    const type = isCredit ? 'CREDIT' : 'DEBIT';
    
    transactions.push({
      id: `TXN-GEN-${idx}-${Date.now()}`,
      date: txDate,
      description: description,
      type: type,
      amount: amount,
      balance: balance,
      status: 'SUCCESS',
      utr: '',
      category: categorizeTransaction(description, type)
    });
  }
  
  // Refine Debit/Credit using Balance Changes
  const sortedByDate = [...transactions].sort((a, b) => {
    const timeA = parseDateString(a.date).getTime() || 0;
    const timeB = parseDateString(b.date).getTime() || 0;
    return timeA - timeB;
  });
  
  let balanceMatchCount = 0;
  for (let i = 1; i < sortedByDate.length; i++) {
    if (sortedByDate[i].balance !== null && sortedByDate[i-1].balance !== null) {
      balanceMatchCount++;
    }
  }
  
  if (balanceMatchCount > sortedByDate.length / 2) {
    for (let i = 1; i < sortedByDate.length; i++) {
      const currentTx = sortedByDate[i];
      const prevTx = sortedByDate[i-1];
      if (currentTx.balance !== null && prevTx.balance !== null) {
        const balChange = currentTx.balance - prevTx.balance;
        if (balChange > 0.01) {
          currentTx.type = 'CREDIT';
        } else if (balChange < -0.01) {
          currentTx.type = 'DEBIT';
        }
        currentTx.category = categorizeTransaction(currentTx.description, currentTx.type);
      }
    }
  }
  
  return transactions;
}

// Group and render filtered transactions month-wise
function renderMonthView() {
  const container = document.getElementById('monthViewContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Group filteredData by Month-Year
  const monthlyGroups = {};
  
  filteredData.forEach(tx => {
    let monthYear = 'Others / Unknown';
    const dateObj = parseDateString(tx.date);
    
    if (!isNaN(dateObj.getTime())) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      monthYear = `${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
    } else {
      // String parsing fallback for Month Names (e.g. "Jun 06, 2026")
      const match = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+,?\s*\d{2,4}/i.exec(tx.date);
      if (match) {
        monthYear = match[0];
      }
    }
    
    if (!monthlyGroups[monthYear]) {
      monthlyGroups[monthYear] = [];
    }
    monthlyGroups[monthYear].push(tx);
  });

  const months = Object.keys(monthlyGroups);
  if (months.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 40px; color: var(--text-muted);">
        No data available for month-wise segregation.
      </div>
    `;
    return;
  }

  // Sort months chronologically (most recent first)
  months.sort((a, b) => {
    const timeA = parseDateString(a).getTime() || 0;
    const timeB = parseDateString(b).getTime() || 0;
    return timeB - timeA;
  });

  months.forEach(month => {
    const txs = monthlyGroups[month];
    
    // Calculate spent, received, savings
    let totalDebit = 0;
    let totalCredit = 0;
    
    txs.forEach(tx => {
      if (tx.status === 'SUCCESS') {
        if (tx.type === 'DEBIT') {
          totalDebit += tx.amount;
        } else {
          totalCredit += tx.amount;
        }
      }
    });
    
    const savings = totalCredit - totalDebit;
    const savingsColor = savings >= 0 ? 'var(--success)' : '#f87171';
    const monthId = month.replace(/\s+/g, '-');

    const card = document.createElement('div');
    card.className = 'card month-card';
    card.style.marginBottom = '20px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '16px';
    
    card.innerHTML = `
      <div class="month-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;" onclick="toggleMonthCollapse('${month}')">
        <div style="display: flex; align-items: center; gap: 12px;">
          <i data-lucide="chevron-down" id="collapseIcon-${monthId}" style="transition: transform 0.2s; color: var(--text-secondary);"></i>
          <h3 style="font-size: 18px; font-weight: 700; color: #fff;">${month}</h3>
          <span class="badge badge-success" style="font-size: 11px;">${txs.length} Transactions</span>
        </div>
        <div class="month-summary-mini" style="display: flex; gap: 20px; font-size: 13px;">
          <span>Spent: <strong style="color: #fca5a5;">${formatCurrency(totalDebit)}</strong></span>
          <span>Received: <strong style="color: #6ee7b7;">${formatCurrency(totalCredit)}</strong></span>
          <span>Net Savings: <strong style="color: ${savingsColor};">${formatCurrency(savings)}</strong></span>
        </div>
      </div>
      
      <div id="monthTxs-${monthId}" class="month-transactions-list" style="display: block; margin-top: 10px;">
        <div class="table-container">
          <table class="transactions-table">
            <thead>
              <tr>
                <th style="width: 140px;">Date & Time</th>
                <th>Transaction Details</th>
                <th style="width: 100px;">Status</th>
                <th style="width: 130px;">Category</th>
                <th style="width: 120px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${txs.map(tx => {
                const amtSign = tx.type === 'DEBIT' ? '-' : '+';
                const amtClass = tx.type === 'DEBIT' ? 'debit' : 'credit';
                let statusClass = 'badge-success';
                if (tx.status === 'FAILED') statusClass = 'badge-failed';
                else if (tx.status === 'PENDING') statusClass = 'badge-pending';
                
                return `
                  <tr>
                    <td>
                      <div style="font-weight: 500;">${tx.date.split(', ')[0]}</div>
                      <div style="font-size: 11px; color: var(--text-muted);">${tx.date.split(', ')[1] || ''}</div>
                    </td>
                    <td>
                      <div class="tx-main-desc">${tx.description}</div>
                      <div class="tx-sub-desc">ID: ${tx.id} ${tx.utr ? `| UTR: ${tx.utr}` : ''}</div>
                    </td>
                    <td><span class="badge ${statusClass}">${tx.status}</span></td>
                    <td>
                      <span class="badge" style="background: rgba(255,255,255,0.04); color: var(--text-secondary); border-left: 3px solid ${CATEGORIES[tx.category]?.color || '#94a3b8'}">
                        ${tx.category}
                      </span>
                    </td>
                    <td class="tx-amount ${amtClass}" style="text-align: right;">${amtSign} ${formatCurrency(tx.amount)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    container.appendChild(card);
  });
  
  initLucide();
}

// Collapsible function registered globally
window.toggleMonthCollapse = function(monthName) {
  const monthId = monthName.replace(/\s+/g, '-');
  const listEl = document.getElementById(`monthTxs-${monthId}`);
  const iconEl = document.getElementById(`collapseIcon-${monthId}`);
  
  if (listEl && iconEl) {
    if (listEl.style.display === 'none') {
      listEl.style.display = 'block';
      iconEl.style.transform = 'rotate(0deg)';
    } else {
      listEl.style.display = 'none';
      iconEl.style.transform = 'rotate(-90deg)';
    }
  }
};
