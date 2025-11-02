
#!/bin/bash

# Simple Slips - Screenshot Capture Script
# This script helps automate the screenshot capture process

echo "🎯 Simple Slips - App Store Screenshot Helper"
echo "=============================================="
echo ""

# Check if the app is running
if ! curl -s http://localhost:5000 > /dev/null; then
    echo "❌ Error: App is not running on localhost:5000"
    echo "Please start the app first with: npm run dev"
    exit 1
fi

echo "✅ App is running on localhost:5000"
echo ""

# Screenshot URLs
declare -A screenshots=(
    ["home"]="http://localhost:5000/home"
    ["upload"]="http://localhost:5000/upload"
    ["analytics"]="http://localhost:5000/analytics"
    ["tax-dashboard"]="http://localhost:5000/tax-dashboard"
    ["receipt-details"]="http://localhost:5000/receipt/11"
    ["smart-search"]="http://localhost:5000/smart"
)

# Device dimensions
declare -A devices=(
    ["iphone-14-pro"]="390x844"
    ["iphone-14-pro-max"]="430x932"
    ["ipad-pro"]="1024x1366"
    ["android-phone"]="390x844"
    ["android-tablet"]="768x1024"
)

echo "📱 Available Screenshots:"
for name in "${!screenshots[@]}"; do
    echo "  • $name: ${screenshots[$name]}"
done

echo ""
echo "📐 Device Dimensions:"
for device in "${!devices[@]}"; do
    echo "  • $device: ${devices[$device]}"
done

echo ""
echo "🔧 Manual Screenshot Instructions:"
echo "1. Open browser developer tools (F12)"
echo "2. Enable device mode (Ctrl+Shift+M)"
echo "3. Set device dimensions (e.g., 390x844 for iPhone)"
echo "4. Navigate to: http://localhost:5000/screenshots"
echo "5. Use the screenshot helper to navigate through screens"
echo ""

echo "🎨 App Store Requirements:"
echo "• iOS: 1290x2796 (6.7\") or 1179x2556 (6.1\")"
echo "• Android: 1080x1920 minimum"
echo "• 2-8 screenshots required"
echo "• PNG or JPEG format"
echo ""

echo "🚀 Ready to capture screenshots!"
echo "Visit: http://localhost:5000/screenshots"
