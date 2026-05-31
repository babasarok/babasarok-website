import "./form-handler";
import { ScrollSnapper } from "./scrollSnapper";

function reactToScroll() {
    if (document.documentElement.scrollTop > 200) {
        document.querySelector(".navbar")?.classList.add("nav__color__change");
    } else {
        document.querySelector(".navbar")?.classList.remove("nav__color__change");
    }
}

document.addEventListener("DOMContentLoaded", function () {
    // change-navigation-color
    window.addEventListener("scroll", function () {
        reactToScroll();
    });

    reactToScroll();

    // Smooth scrolling
    const scrollLink = document.querySelector(".scroll");
    scrollLink.addEventListener("click", function (e) {
        let elem = document.querySelector(this.hash);
        if (elem) {
            e.preventDefault();
            window.scrollTo({
                top: elem.offsetTop,
                behavior: "smooth",
            });
        }
    });

    const navbarCollapse = document.querySelector(".navbar-collapse");
    if (navbarCollapse) {
        navbarCollapse.classList.add("show");
    }

    const navbarLinks = document.querySelectorAll(".navbar-nav>li>a");
    navbarLinks.forEach((link) => {
        link.addEventListener("click", () => {
            if (navbarCollapse) {
                navbarCollapse.classList.remove("show");
            }
        });
    });

    new ScrollSnapper(
        document.getElementsByClassName("service__slider")[0],
        document.getElementsByClassName("service__indicator")[0]
    );
});
