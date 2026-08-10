// IO helpers moved out of index.js
export function codeToImg(currentSvg) {
    let svgimg = document.getElementById('svgimg');
    let svgcode = document.getElementById('svgcode');
    svgcode.value = currentSvg;
    svgimg.innerHTML = currentSvg;
    let cursorsvg = document.getElementById('svgcursors').querySelector('svg');
    let imgsvg = svgimg.querySelector('svg');
    let width = imgsvg.getAttribute('width');
    let height = imgsvg.getAttribute('height');
    let viewBox = imgsvg.getAttribute('viewBox');
    if (width) {
        cursorsvg.setAttribute('width', width);
    }
    if (height) {
        cursorsvg.setAttribute('height', height);
    }
    if (viewBox) {
        cursorsvg.setAttribute('viewBox', viewBox);
    }
}

export function imgToCode() {
    let svgimg = document.getElementById('svgimg');
    let svgcode = document.getElementById('svgcode');
    svgcode.value = svgimg.innerHTML;
    return svgcode.value;
}

export function makeAutoSave(getCollection) {
    return () => {
        getCollection().save({content: imgToCode()});
    };
}
