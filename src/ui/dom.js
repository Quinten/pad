import { getRounding } from '../editor/state.js';

export function toggleToEl(id) {
    let elToShow = document.getElementById(id);
    let siblingSel = '.' + elToShow.className.split(' ').join('.');
    let siblings = elToShow.parentElement.querySelectorAll(siblingSel);
    siblings.forEach(sibling => {
        sibling.style.display = sibling === elToShow ? 'block' : 'none';
    });
}

export function drawGridDots() {
    let rounding = getRounding();
    let svgcursors = document.getElementById('svgcursors').querySelector('svg');
    svgcursors.style.background = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + rounding + ' ' + rounding + '"><circle cx="' + (rounding - 1) + '" cy="' + (rounding - 1) + '" r="1" fill="black" /></svg>') + '")';
    let zoom = svgcursors.clientWidth / svgcursors.viewBox.baseVal.width;
    svgcursors.style.backgroundSize = (rounding * zoom) + 'px ' + (rounding * zoom) + 'px';
    svgcursors.style.backgroundRepeat = 'repeat';
    svgcursors.style.backgroundPosition = '0 0';
}
