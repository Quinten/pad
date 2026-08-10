import { selectedElements, selectedCursors } from './state.js';
import { imgToCode } from '../io.js';
import { toggleToEl } from '../ui/dom.js';

export function deselectAllElements() {
    while (selectedElements.length > 0) {
        selectedElements.pop();
        selectedCursors.pop().remove();
    }
    toggleToEl('svgtools');
}

export function selectElement(el) {
    let svgcursors = document.getElementById('svgcursors').querySelector('svg');
    if (el.closest('#svgimg') && el.tagName !== 'svg') {
        if (selectedElements.includes(el)) {
            let i = selectedElements.indexOf(el);
            selectedElements.splice(i, 1);
            selectedCursors[i].remove();
            selectedCursors.splice(i, 1);
        } else {
            selectedElements.push(el);
            let cursor = el.cloneNode(true);
            svgcursors.appendChild(cursor);
            selectedCursors.push(cursor);
        }
        if (selectedElements.length === 1) {
            let sel = selectedElements[0];
            let fill = sel.getAttribute('fill');
            let stroke = sel.getAttribute('stroke');
            let width = sel.getAttribute('stroke-width');
            if (fill) {
                document.getElementById('fillcolor').value = fill;
            }
            if (stroke) {
                document.getElementById('strokecolor').value = stroke;
            }
            if (width) {
                document.getElementById('strokewidth').value = width;
            }
        }
    } else {
        deselectAllElements();
    }
    toggleToEl(selectedElements.length > 0 ? 'pathtools' : 'svgtools');
}

export function redrawCursors() {
    selectedCursors.forEach((cursor, i) => {
        let el = selectedElements[i];
        cursor.setAttribute('d', el.getAttribute('d'));
    });
}

// window-exposed actions
export function removeElements(getAutoSave) {
    selectedElements.forEach(el => {
        el.remove();
    });
    deselectAllElements();
    if (getAutoSave) getAutoSave()();
}

export function raiseElements(getAutoSave) {
    let allElements = Array.from(document.getElementById('svgimg').querySelector('svg').children);
    let highestSibling = allElements[0];
    let moveUp = [...selectedElements];
    moveUp.sort((a, b) => {
        return allElements.indexOf(a) - allElements.indexOf(b);
    });
    highestSibling = allElements.reduce((acc, el) => {
        if (moveUp.includes(el)) {
            if (el.nextElementSibling && !moveUp.includes(el.nextElementSibling)) {
                return el.nextElementSibling;
            } else {
                return el;
            }
        } else {
            return acc;
        }
    }, highestSibling);
    if (!moveUp.includes(highestSibling)) {
        moveUp.reverse().forEach(el => {
            highestSibling.after(el);
        });
    }
    if (getAutoSave) getAutoSave()();
}

export function lowerElements(getAutoSave) {
    let allElements = Array.from(document.getElementById('svgimg').querySelector('svg').children);
    let lowestSibling = allElements[allElements.length - 1];
    let moveDown = [...selectedElements];
    moveDown.sort((a, b) => {
        return allElements.indexOf(b) - allElements.indexOf(a);
    });
    lowestSibling = allElements.reverse().reduce((acc, el) => {
        if (moveDown.includes(el)) {
            if (el.previousElementSibling && !moveDown.includes(el.previousElementSibling)) {
                return el.previousElementSibling;
            } else {
                return el;
            }
        } else {
            return acc;
        }
    }, lowestSibling);
    if (!moveDown.includes(lowestSibling)) {
        moveDown.reverse().forEach(el => {
            lowestSibling.before(el);
        });
    }
    if (getAutoSave) getAutoSave()();
}

export function fillElements(getAutoSave) {
    selectedElements.forEach(el => {
        el.setAttribute('fill', document.getElementById('fillcolor').value);
    });
    if (getAutoSave) getAutoSave()();
}

export function strokeElements(getAutoSave) {
    let stroke = document.getElementById('strokecolor').value;
    let width = document.getElementById('strokewidth').value;
    if (Number(width) && Number(width) > 0) {
        selectedElements.forEach(el => {
            el.setAttribute('stroke', stroke);
            el.setAttribute('stroke-width', width);
        });
    } else {
        selectedElements.forEach(el => {
            el.removeAttribute('stroke');
            el.removeAttribute('stroke-width');
        });
    }
    if (getAutoSave) getAutoSave()();
}
