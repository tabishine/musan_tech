// Register Form Submission
document.getElementById('registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
  
    const response = await fetch('/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
  
    const data = await response.json();
    alert(data.message);
  });
  
  // Login Form Submission
  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
  
    const response = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
  
    const data = await response.json();
    alert(data.token);
  });
  
  // Logout Form Submission
  document.getElementById('logoutForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('logoutUsername').value;
  
    const response = await fetch('/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username })
    });
  
    const data = await response.json();
    alert(data.message);
  });  