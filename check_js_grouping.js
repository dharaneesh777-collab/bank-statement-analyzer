const fs = require('fs');
const pdfjs = require('pdfjs-dist');

const pdfPath = "C:\\Users\\dhara\\Desktop\\Acct_Statement_XXXXXXXX8080_08062026.pdf";

async function run() {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjs.getDocument({ data: data });
  const pdf = await loadingTask.promise;
  
  let standardText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    standardText += textContent.items.map(item => item.str).join(' ') + '\n';
  }
  
  const txs = parseGeneralStatement(standardText);
  
  // Group by Month-Year as in renderMonthView
  const monthlyGroups = {};
  txs.forEach(tx => {
    let monthYear = 'Others / Unknown';
    const dateObj = new Date(tx.date);
    
    if (!isNaN(dateObj.getTime())) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      monthYear = `${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
    } else {
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
  
  console.log("Monthly Groups in JS:");
  Object.keys(monthlyGroups).forEach(m => {
    const group = monthlyGroups[m];
    const debitSum = group.filter(t => t.type === 'DEBIT').reduce((acc, t) => acc + t.amount, 0);
    const creditSum = group.filter(t => t.type === 'CREDIT').reduce((acc, t) => acc + t.amount, 0);
    console.log(`  ${m}: Total Txs = ${group.length}, Debits = ${debitSum}, Credits = ${creditSum}`);
  });
}

function parseGeneralStatement(text) {
  const dateRegex = /\b(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi;
  
  const matches = [];
  let match;
  while ((match = dateRegex.exec(text)) !== null) {
    if (matches.length > 0 && matches[matches.length - 1].index === match.index) continue;
    matches.push({
      date: match[1],
      index: match.index
    });
  }

  const transactions = [];

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const startIdx = current.index;
    const endIdx = i === matches.length - 1 ? text.length : Math.min(current.index + 400, matches[i+1].index);
    const windowText = text.substring(startIdx, endIdx);

    const amtRegex = /\b(\d+(?:,\d{3})*(?:\.\d{2}))\b/g;
    const amounts = [];
    let amtMatch;
    while ((amtMatch = amtRegex.exec(windowText)) !== null) {
      amounts.push({
        val: parseFloat(amtMatch[1].replace(/,/g, '')),
        raw: amtMatch[1]
      });
    }

    if (amounts.length === 0) continue;

    let amount = amounts[0].val;
    let balance = amounts.length > 1 ? amounts[amounts.length - 1].val : null;

    const descLower = windowText.toLowerCase();
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

    let description = windowText
      .replace(current.date, '')
      .replace(amounts[0].raw, '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (amounts.length > 1) {
      description = description.replace(amounts[amounts.length-1].raw, '');
    }

    description = description
      .replace(/debit|credit|cr|dr|success|failed|balance/gi, '')
      .replace(/[^a-zA-Z0-9\s\-\/\.\(\)\#\_]/g, ' ')
      .replace(/\b\d{12}\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    description = description.replace(/^[\-\/\.\s\(\)]+/, '').trim();

    if (!description || description.length < 3) {
      description = 'Bank Transaction';
    }

    if (description.length > 60) {
      description = description.substring(0, 57) + '...';
    }

    const id = `TXN-GEN-${i}-${Date.now()}`;

    transactions.push({
      id: id,
      date: current.date,
      description: description,
      type: type,
      amount: amount,
      balance: balance
    });
  }

  const sortedByDate = [...transactions].sort((a, b) => {
    const timeA = new Date(a.date).getTime() || 0;
    const timeB = new Date(b.date).getTime() || 0;
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
      }
    }
  }

  return transactions;
}

run().catch(console.error);
