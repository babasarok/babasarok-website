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
    const scrollLinks = document.querySelectorAll(".scroll");
    scrollLinks.forEach((scrollLink) => {
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
    });

    new ScrollSnapper(
        document.getElementsByClassName("service__slider")[0],
        document.getElementsByClassName("service__indicator")[0]
    );
});
