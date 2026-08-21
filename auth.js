document.addEventListener('DOMContentLoaded', () => {
// Role tab switching
const roleTabs = document.querySelectorAll('.role-tab');
const driverFields = document.getElementById('driverFields');

roleTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    roleTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    if (tab.dataset.role === 'driver') {
      driverFields.classList.remove('hidden');
    } else {
      driverFields.classList.add('hidden');
    }
  });
});

// File upload preview
const docUpload = document.getElementById('docUpload');
const uploadedFiles = document.getElementById('uploadedFiles');

if (docUpload) {
  docUpload.addEventListener('change', (e) => {
    uploadedFiles.innerHTML = '';
    Array.from(e.target.files).forEach(file => {
      const tag = document.createElement('span');
      tag.className = 'file-tag';
      tag.textContent = '📎 ' + file.name;
      uploadedFiles.appendChild(tag);
    });
  });
}

// OTP handling
const otpInputs = document.querySelectorAll('.otp-input');
otpInputs.forEach((input, index) => {
  input.addEventListener('input', (e) => {
    if (e.target.value.length === 1 && index < otpInputs.length - 1) {
      otpInputs[index + 1].focus();
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !e.target.value && index > 0) {
      otpInputs[index - 1].focus();
    }
  });
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const data = (e.clipboardData || window.clipboardData).getData('text').slice(0, 6);
    data.split('').forEach((char, i) => {
      if (otpInputs[i]) otpInputs[i].value = char;
    });
  });
});

// Send OTP
const sendOtpBtn = document.getElementById('sendOtpBtn');
const otpSection = document.getElementById('otpSection');

sendOtpBtn.addEventListener('click', () => {
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  if (!name || !phone || phone.length !== 10) {
    alert('Please enter a valid name and 10-digit phone number');
    return;
  }
  const activeRole = document.querySelector('.role-tab.active').dataset.role;
  if (activeRole === 'driver') {
    const vNum = document.getElementById('vehicleNumber').value.trim();
    const rc = document.getElementById('rcNumber').value.trim();
    const lic = document.getElementById('license').value.trim();
    if (!vNum || !rc || !lic) {
      alert('Please fill all vehicle details');
      return;
    }
  }
  sendOtpBtn.textContent = 'Sending...';
  setTimeout(() => {
    otpSection.classList.remove('hidden');
    sendOtpBtn.textContent = 'OTP Sent ✓';
    sendOtpBtn.disabled = true;
    otpInputs[0].focus();
  }, 800);
});

// Resend OTP
const resendOtp = document.getElementById('resendOtp');
if (resendOtp) {
  resendOtp.addEventListener('click', (e) => {
    e.preventDefault();
    alert('OTP resent to your phone');
  });
}

// Verify OTP
const verifyBtn = document.getElementById('verifyBtn');
verifyBtn.addEventListener('click', () => {
  const otp = Array.from(otpInputs).map(i => i.value).join('');
  if (otp.length !== 6) {
    alert('Please enter the complete 6-digit OTP');
    return;
  }

  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const activeRole = document.querySelector('.role-tab.active').dataset.role;

  const userData = {
    name,
    phone,
    role: activeRole,
    loggedIn: true
  };

  if (activeRole === 'driver') {
    userData.vehicleNumber = document.getElementById('vehicleNumber').value.trim();
    userData.rcNumber = document.getElementById('rcNumber').value.trim();
    userData.vehicleType = document.getElementById('vehicleType').value;
    userData.license = document.getElementById('license').value.trim();
  }

  localStorage.setItem('rideUser', JSON.stringify(userData));

  verifyBtn.textContent = 'Verifying...';
  setTimeout(() => {
    if (activeRole === 'driver') {
      window.location.href = 'driver.html';
    } else {
      window.location.href = 'user.html';
    }
  }, 1000);
});
}); // end DOMContentLoaded
