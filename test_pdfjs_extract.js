const fs = require('fs');
const pdfjs = require('pdfjs-dist');

const pdfPath = "C:\\Users\\dhara\\Desktop\\Acct_Statement_XXXXXXXX8080_08062026.pdf";

async function run() {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjs.getDocument({ data: data });
  const pdf = await loadingTask.promise;
  
  console.log(`PDF Pages: ${pdf.numPages}`);
  
  // 1. Standard Extraction
  let standardText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    standardText += textContent.items.map(item => item.str).join(' ') + '\n';
  }
  
  // Parse standard text
  const txsStandard = parseGeneralStatement(standardText);
  console.log(`\nStandard Text: Transactions Parsed: ${txsStandard.length}`);
  
  // 2. Sorted Extraction
  let sortedText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    sortedText += getSortedTextFromPage(textContent) + '\n';
  }
  
  const txsSorted = parseGeneralStatement(sortedText);
  console.log(`\nSorted Text: Transactions Parsed: ${txsSorted.length}`);
}

function getSortedTextFromPage(textContent) {
  const items = textContent.items.map(item => {
    return {
      str: item.str,
      x: item.transform[4],
      y: item.transform[5]
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
  
  lines.sort((a, b) => b.y - a.y);
  
  let result = "";
  lines.forEach(line => {
    line.items.sort((a, b) => a.x - b.x);
    const lineText = line.items.map(item => item.str).join(' ');
    result += lineText + '\n';
  });
  
  return result;
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

    transactions.push({
      date: current.date,
      amount: amount,
      balance: balance
    });
  }
  return transactions;
}

run().catch(console.error);
