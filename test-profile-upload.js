// Test profile picture upload
// Run this in browser console when authenticated

// Create a minimal 1x1 test image
const canvas = document.createElement('canvas');
canvas.width = 1;
canvas.height = 1;
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#0073AA'; // Simple blue color
ctx.fillRect(0, 0, 1, 1);

// Convert to base64
const testImageData = canvas.toDataURL('image/jpeg', 0.8);

console.log('Test image data length:', testImageData.length);

// Get auth token from localStorage
const token = localStorage.getItem('auth_token');
if (!token) {
  console.error('No auth token found!');
} else {
  console.log('Auth token found:', token.substring(0, 20) + '...');
  
  // Test upload
  fetch('/api/profile/picture', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ imageData: testImageData })
  })
  .then(res => res.json())
  .then(data => {
    console.log('Upload response:', data);
  })
  .catch(err => {
    console.error('Upload error:', err);
  });
}