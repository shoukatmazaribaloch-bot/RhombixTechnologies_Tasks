// Welcome message
console.log("Welcome to Shoukat Hussain's Portfolio!");


// Current year automatically update
const year = new Date().getFullYear();

document.querySelector("footer p").innerHTML =
    `&copy; ${year} Shoukat Hussain. All Rights Reserved.`;


// Navigation links
const navLinks = document.querySelectorAll("nav ul li a");

navLinks.forEach(function(link) {

    link.addEventListener("click", function() {

        navLinks.forEach(function(item) {
            item.classList.remove("active");
        });

        this.classList.add("active");
    });

});