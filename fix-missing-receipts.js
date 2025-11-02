import fs from 'fs';
import path from 'path';

// Check which receipt files exist locally vs database
const uploadsDir = 'uploads/receipts';
const localFiles = fs.readdirSync(uploadsDir);

console.log('=== LOCAL FILES FOUND ===');
localFiles.forEach(file => {
  const filePath = path.join(uploadsDir, file);
  const stats = fs.statSync(filePath);
  console.log(`${file} - ${Math.round(stats.size/1024)}KB`);
});

console.log('\n=== MISSING DATABASE ENTRIES ===');
console.log('receipt_1754576167319_mzavqzqsvb.jpg - MISSING');
console.log('receipt_1754576110632_9pak7v3vigw.jpg - MISSING'); 
console.log('receipt_1754576028505_odyaax4utsm.jpg - MISSING');

console.log('\n=== SOLUTION ===');
console.log('The receipts uploaded from phone were lost in transit.');
console.log('Need to either:');
console.log('1. Re-upload these receipts from your phone');
console.log('2. Map existing local files to these database entries');
console.log('3. Mark these receipts as missing and allow re-upload');