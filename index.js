document.addEventListener('DOMContentLoaded', function() {
    const getStartedBtn = document.getElementById('getStartedBtn');
    
    getStartedBtn.addEventListener('click', function() {
        window.location.href = 'auth/signup.html';
    });
});