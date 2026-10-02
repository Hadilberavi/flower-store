document.addEventListener('DOMContentLoaded', function () {

    // DOM Elements
    // Bu kısımda sayfadaki bazı elementleri seçtik. Bu elementlerin bazıları butonlar, bazıları form alan
    const searchForm = document.querySelector('.search-form');
    const loginForm = document.querySelector('.login-form');
    const cart = document.querySelector('.shopping-cart');
    const scrollToTopButton = document.querySelector(".scroll-to-top");
    const menuBtn = document.querySelector('#menu-btn');
    const navbar = document.querySelector('.navbar.mobile');
    const shoppingCart = document.querySelector('.shopping-cart');
    const deleteIcons = shoppingCart.querySelectorAll('.box .fas.fa-times')
    const searchBtn = document.querySelector('#search-btn');
    const cartBtn = document.querySelector('#cart-btn');
    const loginBtn = document.querySelector('#login-btn');
    const products = document.querySelectorAll('.products .box-container .box');

    // Window Events

    // Sayfa yüklendiğinde veya sayfa aşağı kaydırıldığında header'ın arka plan rengini değiştirebilirsiniz.
    window.addEventListener('scroll', function () {
        const header = document.querySelector('header');
        header.classList.toggle('scrolled', window.scrollY > 50);
    });

    //Sayfa yüklendiğinde veya sayfa aşağı kaydırıldığında içeriklerin yavaşça görünmesini sağlayabilirsiniz.
    window.addEventListener('scroll', function () {
        const contents = document.querySelectorAll('.content');
        contents.forEach(content => {
            const contentPosition = content.getBoundingClientRect().top;
            const screenPosition = window.innerHeight / 1.2;
            if (contentPosition < screenPosition) {
                content.classList.add('visible');
            }
        });
    });


    // Sayfa yüklendiğinde veya sayfa aşağı kaydırıldığında içeriklerin yavaşça görünmesini sağlayabilirsiniz.
    window.onscroll = function () {
        if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
            scrollToTopButton.style.display = "flex";
        } else {
            scrollToTopButton.style.display = "none";
        }
    };

    if (loginBtn) {
        loginBtn.onclick = () => {
            loginForm.classList.toggle('active');
            searchForm.classList.remove('active');
            cart.classList.remove('active');
        }
    }

    // Bu kısımda arama butonuna tıklandığında arama formunun açılması sağlanmıştır.
    searchBtn.onclick = () => {
        searchForm.classList.toggle('active');
        loginForm.classList.remove('active');
        cart.classList.remove('active');
    }


    // sepete tiklandiginda urunler kismi ekrana activ olmasi icin
    cartBtn.onclick = () => {
        cart.classList.toggle('active');
        searchForm.classList.remove('active');
        loginForm.classList.remove('active');
    }

    ///////////// menu  btn tiklama
    document.addEventListener('DOMContentLoaded', function () {
        const menuBtn = document.getElementById('menu-btn');
        const navbar = document.querySelector('.navbar.mobile');

        menuBtn.addEventListener('click', function () {
            // Navbar'a active sınıfını ekleyin veya çıkarın
            navbar.classList.toggle('.active');  /// buraya nokta eklememiz lazimdi
        });
    });


    // Kullanıcı butona tıkladığında dokümanın üstüne doğru kaydır
    scrollToTopButton.onclick = function (event) {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }


    menuBtn.addEventListener('click', function () {
        navbar.classList.toggle('active');
    });


    // Bu kısımda sepete eklenen ürünlerin silinmesi sağlanmıştır.
    deleteIcons.forEach(deleteIcon => {
        deleteIcon.addEventListener('click', function () {
            const product = this.parentElement;
            product.remove();
            updateTotal();
        });
    });


    // Bu kısımda ürünlerin içerisindeki sepete ekle butonuna tıklanıldığında sepete ürün eklenmesi sağlanmıştır.
    products.forEach((product) => {
        product.querySelector('.icons .fas.fa-shopping-cart').addEventListener('click', function () {
            addProductToCart(product);
        });
    });

});

let index = 0;

// Bu fonksiyon, yeni bir ürün kartı oluşturur
const generateNewCartItem = (name, price, quantity, image) => {
    const newCartItem = document.createElement('div');
    newCartItem.classList.add('box');
    newCartItem.innerHTML = `
      <i class="fas fa-times"></i>
      <img src="${image}" alt=""/>
      <div class="content">
        <h3>${name}</h3>
        <span class="multiply">${quantity} ×</span>
        <span class="price">${price} $</span>
      </div>
    `;
    newCartItem.querySelector('.fas.fa-times').addEventListener('click', function () {
        newCartItem.remove();
        updateTotal();
    });
    return newCartItem;
}

// Bu fonksiyon, ürünü sepete ekler
const addProductToCart = (product) => {

    const loginForm = document.querySelector('.login-form');

    if (loginForm) {
        loginForm.classList.add('active');

        return;
    }


    const productName = product.querySelector('.content h3').innerText;
    const productPrice = product.querySelector('.content .price').innerText;
    const productImage = product.querySelector('img').src;
    const newCartItem = generateNewCartItem(productName, productPrice, 1, productImage);
    const shoppingCart = document.querySelector('.shopping-cart');

    if (productInCart(productName)) {
        return alert('Product already in cart');
    }
    shoppingCart.prepend(newCartItem);
    updateTotal();
}

// Bu fonksiyon, sepete eklenen ürünlerin toplam fiyatını günceller
const productInCart = (productName) => {
    const shoppingCart = document.querySelector('.shopping-cart');
    const inCartItemNames = shoppingCart.querySelectorAll('.box .content h3');
    for (let i = 0; i < inCartItemNames.length; i++) {
        if (inCartItemNames[i].innerText === productName) {
            console.log('Product already in cart', productName, inCartItemNames[i].innerText);
            return true;
        }
    }
    return false;
}

// Bu fonksiyon, sepete eklenen ürünlerin toplam fiyatını günceller
function next() {
    const slides = document.querySelectorAll('.home .slides-container .slide');
    if (!slides) return;

    slides[index].classList.remove('active');
    index = (index + 1) % slides.lenght;
    slides[index].classList.add('active')
}

// Bu fonksiyon, sepete eklenen ürünlerin toplam fiyatını günceller
function prev() {
    const slides = document.querySelectorAll('.home .slides-container .slide');
    if (!slides) return;
    slides[index].classList.remove('active');
    index = (index - 1 + slides.lenght) % slides.lenght;
    slides[index].classList.add('active')
}


// Bu fonksiyon, sepete eklenen ürünlerin toplam fiyatını günceller
const updateTotal = () => {
    const shoppingCart = document.querySelector('.shopping-cart');

    const shoppingCartTotal = shoppingCart.querySelector('.total span');

    let total = 0;
    const prices = shoppingCart.querySelectorAll('.box .price');
    prices.forEach(price => {
        total += parseFloat(price.innerText.replace('$', ''));
    });
    shoppingCartTotal.innerText = total.toFixed(2);
}


