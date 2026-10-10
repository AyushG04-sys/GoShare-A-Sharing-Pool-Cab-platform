import { loginUser } from './store.js';

console.log("🚀 Index.js module loaded");

const init = () => {
  const userTab = document.getElementById('userTab');
  const driverTab = document.getElementById('driverTab');
  const vehicleGroup = document.getElementById('vehicleGroup');
  const plateGroup = document.getElementById('plateGroup');
  const documentsGroup = document.getElementById('documentsGroup');
  
  const authActionBtn = document.getElementById('authActionBtn');
  const authModeToggle = document.getElementById('authModeToggle');
  const nameInput = document.getElementById('nameInput');

  let currentRole = 'user';
  let isLoginMode = false; // false = Register, true = Login

  // Function to update the UI based on Role and Auth Mode
  const updateUI = () => {
    // 1. Handle Tabs
    if (currentRole === 'user') {
      userTab.style.background = 'white'; userTab.style.color = 'black'; userTab.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      driverTab.style.background = 'transparent'; driverTab.style.color = '#6b7280'; driverTab.style.boxShadow = 'none';
    } else {
      driverTab.style.background = 'white'; driverTab.style.color = 'black'; driverTab.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      userTab.style.background = 'transparent'; userTab.style.color = '#6b7280'; userTab.style.boxShadow = 'none';
    }

    // 2. Handle Document Visibility (Only show if Driver AND Registering)
    if (currentRole === 'driver' && !isLoginMode) {
      if(vehicleGroup) vehicleGroup.classList.remove('hidden');
      if(plateGroup) plateGroup.classList.remove('hidden');
      if(documentsGroup) documentsGroup.classList.remove('hidden');
    } else {
      if(vehicleGroup) vehicleGroup.classList.add('hidden');
      if(plateGroup) plateGroup.classList.add('hidden');
      if(documentsGroup) documentsGroup.classList.add('hidden');
    }

    // 3. Update Texts
    if (authActionBtn) authActionBtn.textContent = isLoginMode ? 'Login' : 'Register';
    if (authModeToggle) authModeToggle.textContent = isLoginMode ? "Don't have an account? Register" : "Already have an account? Login";
  };

  userTab?.addEventListener('click', () => { currentRole = 'user'; updateUI(); });
  driverTab?.addEventListener('click', () => { currentRole = 'driver'; updateUI(); });
  
  authModeToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode; // Flip the mode
    updateUI();
  });

  // Handle Form Submission
  authActionBtn?.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const phone = document.getElementById('phoneInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();

    if (!phone || !password || (!isLoginMode && !name)) {
      return alert("Please fill in Phone, Password, and Name (if registering).");
    }

    const userData = { name, phone, password, role: currentRole };

    // If registering as a driver, validate the extra fields
    if (currentRole === 'driver' && !isLoginMode) {
      const photo = document.getElementById('driverPhoto')?.files?.length;
      const dl = document.getElementById('drivingLicense')?.files?.length;
      const rc = document.getElementById('vehicleRC')?.files?.length;
      const ins = document.getElementById('vehicleInsurance')?.files?.length;

      if (!photo || !dl || !rc || !ins) {
        return alert("Please upload all required Driver & Vehicle documents to register.");
      }

      userData.vehicleType = document.getElementById('vehicleType').value;
      userData.vehicleNumber = document.getElementById('vehicleNumber').value || 'Pending';
    }

    try {
      authActionBtn.textContent = 'Processing...';
      await loginUser(userData);
      window.location.href = currentRole === 'user' ? 'user.html' : 'driver.html';
    } catch (e) {
      console.error("Auth error:", e);
      alert(`Authentication failed: ${e.message}`);
      authActionBtn.textContent = isLoginMode ? 'Login' : 'Register';
    }
  });

  // Initialize UI on load
  updateUI();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}