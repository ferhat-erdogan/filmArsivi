/**
 * Kullanıcı Giriş Kontrolü
 * Uygulama açıldığında veya sayfa değiştiğinde çalışır.
 */
function checkLogin() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const path = window.location.pathname;

    // Eğer giriş yapmamışsa ve index.html dışındaysa login'e zorla
    // (Geliştirme aşamasında index.html'de login penceresi açacağız)
    if (!isLoggedIn && !path.includes('login.html')) {
        // İleride buraya özel bir login modalı veya sayfası ekleyebiliriz
        // Şimdilik basit bir prompt ile test edebilirsin:
        // verifyUser(); 
    }
}

/**
 * Kullanıcı Doğrulama (Basit Şifreleme Mantığı)
 */
function verifyUser(password) {
    const MASTER_PASS = "1234"; // Senin belirleyeceğin giriş şifresi

    if (password === MASTER_PASS) {
        sessionStorage.setItem('isLoggedIn', 'true');
        showToast("GİRİŞ BAŞARILI");
        return true;
    } else {
        showToast("HATALI ŞİFRE!");
        return false;
    }
}

/**
 * Oturumu Kapat
 */
function logout() {
    sessionStorage.removeItem('isLoggedIn');
    window.location.reload();
}

/**
 * Sayfa Yüklendiğinde Otomatik Kontrol
 */
document.addEventListener('DOMContentLoaded', () => {
    // Şimdilik geliştirme aşamasında olduğumuz için kontrolü pasif tutabiliriz
    // veya aşağıdakini açabilirsin:
    // checkLogin();
});

