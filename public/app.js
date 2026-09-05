const state = { mode: 'login', role: 'RESIDENT' };
const form = document.querySelector('#auth-form');
const message = document.querySelector('#form-message');
const submitButton = document.querySelector('#submit-button');
const submitLabel = document.querySelector('#submit-label');
const password = document.querySelector('#password');
const confirmPassword = document.querySelector('#confirm-password');

function setMessage(text, success = false) {
  message.textContent = text;
  message.classList.toggle('success', success);
}

function updateMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-button').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  const signup = mode === 'signup';
  if (signup && state.role === 'ADMIN') state.role = 'RESIDENT';
  document.querySelector('#signup-fields').classList.toggle('hidden', !signup);
  document.querySelector('.role-picker').classList.toggle('hidden', !signup);
  document.querySelector('#form-kicker').textContent = signup ? 'JOIN THE COMMUNITY' : 'WELCOME BACK';
  document.querySelector('#form-title').textContent = signup ? 'Create your account' : 'Sign in to your desk';
  document.querySelector('#form-subtitle').textContent = signup ? 'Choose your role and get started with San Pascual Connect.' : 'Track requests, report concerns, and stay connected.';
  document.querySelector('#password-hint').textContent = signup ? '8 characters minimum' : '';
  document.querySelector('#password-rules').classList.toggle('hidden', !signup);
  document.querySelector('#confirm-password-field').classList.toggle('hidden', !signup);
  document.querySelector('#official-fields').classList.toggle('hidden', !(signup && state.role === 'STAFF'));
  document.querySelector('.privacy-consent').classList.toggle('hidden', !signup);
  document.querySelector('.login-only-role').classList.toggle('hidden', signup);
  document.querySelector('#forgot-button').classList.toggle('hidden', signup);
  submitLabel.textContent = signup ? 'Create my account' : 'Continue to your desk';
  setMessage('');
}

document.querySelectorAll('.mode-button').forEach((button) => button.addEventListener('click', () => updateMode(button.dataset.mode)));
document.querySelectorAll('.role-option').forEach((button) => button.addEventListener('click', () => {
  state.role = button.dataset.role;
  document.querySelectorAll('.role-option').forEach((option) => {
    const active = option === button;
    option.classList.toggle('active', active);
    option.setAttribute('aria-checked', String(active));
  });
  document.querySelector('#official-fields').classList.toggle('hidden', !(state.mode === 'signup' && state.role === 'STAFF'));
}));

document.querySelector('#password-toggle').addEventListener('click', (event) => {
  const visible = password.type === 'text';
  password.type = visible ? 'password' : 'text';
  event.currentTarget.textContent = visible ? 'Show' : 'Hide';
  event.currentTarget.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
});

document.querySelector('.confirm-toggle').addEventListener('click', (event) => {
  const visible = confirmPassword.type === 'text';
  confirmPassword.type = visible ? 'password' : 'text';
  event.currentTarget.textContent = visible ? 'Show' : 'Hide';
  event.currentTarget.setAttribute('aria-label', visible ? 'Show confirmation password' : 'Hide confirmation password');
});

document.querySelector('#forgot-button').addEventListener('click', () => setMessage('Password recovery will be available after email delivery is configured.'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');
  const email = document.querySelector('#email').value.trim();
  const passwordValue = password.value;
  if (!email || passwordValue.length < 8) {
    setMessage('Enter a valid email and a password with at least 8 characters.');
    return;
  }

  const payload = { email, password: passwordValue };
  if (state.mode === 'signup') {
    if (!/[a-z]/.test(passwordValue) || !/[A-Z]/.test(passwordValue) || !/[0-9]/.test(passwordValue) || !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(passwordValue)) {
      setMessage('Password must include uppercase, lowercase, a number, and a special character such as !, @, #, $, %, & or *.');
      return;
    }
    if (passwordValue !== confirmPassword.value) {
      setMessage('Passwords do not match.');
      return;
    }
    payload.firstName = document.querySelector('#first-name').value.trim();
    payload.lastName = document.querySelector('#last-name').value.trim();
    payload.middleName = document.querySelector('#middle-name').value.trim();
    payload.age = document.querySelector('#age').value;
    payload.gender = document.querySelector('#gender').value;
    payload.birthDate = document.querySelector('#birth-date').value;
    payload.nationality = document.querySelector('#nationality').value.trim();
    payload.phone = document.querySelector('#phone').value.trim();
    payload.address = document.querySelector('#address').value.trim();
    payload.barangay = document.querySelector('#barangay').value.trim();
    payload.municipality = document.querySelector('#municipality').value.trim();
    payload.province = document.querySelector('#province').value.trim();
    payload.residencyConfirmed = document.querySelector('#residency-confirmed').checked;
    payload.privacyConsent = document.querySelector('#privacy-consent').checked;
    payload.role = state.role;
    payload.confirmPassword = confirmPassword.value;
    if (!payload.firstName || !payload.lastName || !payload.middleName || !payload.age || !payload.gender || !payload.birthDate || !payload.nationality || !payload.phone || !payload.address || !payload.residencyConfirmed || !payload.privacyConsent) {
      setMessage('Complete all required information, residency confirmation, and privacy consent.');
      return;
    }
    if (state.role === 'STAFF') {
      payload.designationPosition = document.querySelector('#designation-position').value.trim();
      payload.governmentIdType = document.querySelector('#government-id-type').value.trim();
      payload.governmentIdNumber = document.querySelector('#government-id-number').value.trim();
      const governmentIdFile = document.querySelector('#government-id-file').files[0];
      const appointmentProofFile = document.querySelector('#appointment-proof-file').files[0];
      if (!payload.designationPosition || !payload.governmentIdType || !payload.governmentIdNumber || !governmentIdFile || !appointmentProofFile) {
        setMessage('Complete the official designation, ID details, and both required document uploads.');
        return;
      }
    }
  }

  submitButton.disabled = true;
  submitLabel.textContent = state.mode === 'signup' ? 'Creating account...' : 'Signing in...';
  try {
    const requestBody = state.mode === 'signup' ? new FormData() : JSON.stringify(payload);
    if (state.mode === 'signup') {
      Object.entries(payload).forEach(([key, value]) => requestBody.append(key, String(value)));
      if (state.role === 'STAFF') {
        requestBody.append('governmentIdFile', document.querySelector('#government-id-file').files[0]);
        requestBody.append('appointmentProofFile', document.querySelector('#appointment-proof-file').files[0]);
      }
    }
    const response = await fetch(`/api/auth/${state.mode}`, { method: 'POST', ...(state.mode === 'login' ? { headers: { 'Content-Type': 'application/json' } } : {}), body: requestBody });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to complete this request.');
    localStorage.setItem('sanPascualUser', JSON.stringify(data.user));
    if (data.token) localStorage.setItem('sanPascualToken', data.token);
    if (data.user.role === 'ADMIN') window.location.replace('/admin.html');
    setMessage(data.pendingApproval ? 'Your account was submitted for approval. Access will be available after barangay verification.' : `Welcome, ${data.user.firstName}. Your ${roleLabel(data.user.role)} account is ready.`, true);
    submitLabel.textContent = 'Access granted';
  } catch (error) {
    setMessage(error.message);
    submitLabel.textContent = state.mode === 'signup' ? 'Create my account' : 'Continue to your desk';
  } finally {
    submitButton.disabled = false;
  }
});

function roleLabel(role) {
  return role === 'ADMIN' ? 'admin' : role === 'STAFF' ? 'barangay official' : 'resident';
}
