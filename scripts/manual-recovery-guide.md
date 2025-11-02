# Manual Recovery Guide for Orphaned Receipt Images

## Overview
You have 5 receipt images safely stored in Azure that need to be reconnected to your database.

## Orphaned Images Found

### 1. Receipt from April 10, 2025 (9:16 AM)
- **File**: `1744276592504-q71fdylh9tm.jpg`
- **URL**: https://slipsstor1.blob.core.windows.net/receipt-images/1744276592504-q71fdylh9tm.jpg
- **Size**: 2.7 MB

### 2. Receipt from April 10, 2025 (9:30 AM)
- **File**: `1744277409224-nrhxei99cka.jpg`
- **URL**: https://slipsstor1.blob.core.windows.net/receipt-images/1744277409224-nrhxei99cka.jpg
- **Size**: 2.8 MB

### 3. Receipt from May 25, 2025 (1:13 PM)
- **File**: `1748178817745-68hpzbrurp6.jpg`
- **URL**: https://slipsstor1.blob.core.windows.net/receipt-images/1748178817745-68hpzbrurp6.jpg
- **Size**: 125 KB

### 4. Receipt from May 30, 2025 (9:17 AM)
- **File**: `1748596655756-q80tia9adv.jpg`
- **URL**: https://slipsstor1.blob.core.windows.net/receipt-images/1748596655756-q80tia9adv.jpg
- **Size**: 2.7 MB

### 5. Receipt from June 2, 2025 (9:34 AM)
- **File**: `1748856883827-gkemseoyze.jpg`
- **URL**: https://slipsstor1.blob.core.windows.net/receipt-images/1748856883827-gkemseoyze.jpg
- **Size**: 2.8 MB

## Recovery Options

### Option A: Automated Recovery (Recommended)
Run the automated recovery script:
```bash
node scripts/automated-recovery.js
```

This will:
1. Create placeholder receipt entries in your database
2. Link them to the existing Azure images
3. Set basic metadata (date extracted from filename)
4. Mark them as "recovered" for easy identification

### Option B: Manual Recovery via App
1. Open each image URL in your browser
2. Save the image to your device
3. Upload it through your app's normal receipt upload process
4. The app will process it with OCR and categorization

### Option C: Download and Re-upload
```bash
# Download images manually
curl -o receipt1.jpg "https://slipsstor1.blob.core.windows.net/receipt-images/1744276592504-q71fdylh9tm.jpg"
curl -o receipt2.jpg "https://slipsstor1.blob.core.windows.net/receipt-images/1744277409224-nrhxei99cka.jpg"
curl -o receipt3.jpg "https://slipsstor1.blob.core.windows.net/receipt-images/1748178817745-68hpzbrurp6.jpg"
curl -o receipt4.jpg "https://slipsstor1.blob.core.windows.net/receipt-images/1748596655756-q80tia9adv.jpg"
curl -o receipt5.jpg "https://slipsstor1.blob.core.windows.net/receipt-images/1748856883827-gkemseoyze.jpg"
```

## What Each Option Gives You

### Automated Recovery
- ✅ Fastest method
- ✅ Preserves original Azure links
- ✅ Maintains file references
- ⚠️  Requires manual editing of store names/amounts

### Manual Re-upload
- ✅ Full OCR processing
- ✅ Automatic categorization
- ✅ Complete metadata extraction
- ⚠️  Creates duplicate images in Azure
- ⚠️  More time-consuming

## Recommendation

Use **Option A (Automated Recovery)** because:
1. It's fastest and preserves your existing Azure storage structure
2. The images will display properly in your app immediately
3. You can edit the receipt details manually as needed
4. It maintains the original timestamps and file references

After recovery, you can improve the data by:
- Editing store names and amounts manually
- Re-running OCR if you have that feature
- Adding proper categories and tags