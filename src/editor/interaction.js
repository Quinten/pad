import { selectedElements } from './state.js';
import { selectElement, redrawCursors, deselectAllElements, fillElements, strokeElements } from './selection.js';
import { drawGridDots } from '../ui/dom.js';
import { getRounding } from './state.js';

export function initInteraction(getAutoSave) {
    document.querySelectorAll('.custom-touch').forEach(container => {

        let getSvgXY = (e) => {
            let imgsvg = document.getElementById('svgimg').querySelector('svg');
            let width = imgsvg.getAttribute('width');
            if (!width) {
                let viewBox = imgsvg.getAttribute('viewBox');
                if (viewBox) {
                    width = viewBox.split(' ')[2];
                }
            }
            let x = 0;
            let y = 0;
            if (e.touches) {
                x = e.touches[0].clientX;
                y = e.touches[0].clientY;
            } else {
                x = e.clientX;
                y = e.clientY;
            }
            let offsetX = imgsvg.getBoundingClientRect().left;
            let offsetY = imgsvg.getBoundingClientRect().top;
            x -= offsetX;
            y -= offsetY;
            width = Number(width);
            let zoom = width / imgsvg.clientWidth;
            x = x * zoom;
            y = y * zoom;
            let rounding = getRounding();
            x = x - (x % rounding);
            y = y - (y % rounding);
            return {x, y};
        };

        let getClosestElementsNodeAtXY = (els, x, y) => {
            let nodes = [];
            els.forEach(el => {
                let path = el.getAttribute('d');
                let elNodes = path.split(/[MLZ]/).map(s => s.trim()).filter(s => s.length > 0).map(s => {
                    let [px, py] = s.split(' ').map(Number);
                    return {x: px, y: py, d: Math.hypot(px - x, py - y), el};
                });
                nodes.push(...elNodes);
            });
            nodes.sort((a, b) => a.d - b.d);
            return nodes[0];
        };

        let currentNode = undefined;
        let selectNode = (e) => {
            let {x, y} = getSvgXY(e);
            let closestNode = getClosestElementsNodeAtXY(selectedElements, x, y);
            currentNode = closestNode;
        };

        let dragNode = (e) => {
            if (currentNode === undefined) {
                return;
            }
            let {x, y} = getSvgXY(e);
            let path = currentNode.el.getAttribute('d');
            path = path.replace(
                String(currentNode.x) + ' ' + String(currentNode.y),
                String(x) + ' ' + String(y)
            );
            currentNode.x = x;
            currentNode.y = y;
            currentNode.el.setAttribute('d', path);
            redrawCursors();
        };

        let deselectNode = () => {
            currentNode = undefined;
        };

        let currentPad = undefined;
        let drawPath = (e) => {
            if (selectedElements.length > 0) {
                selectNode(e);
                return;
            }
            let {x, y} = getSvgXY(e);
            let cursorsvg = document.getElementById('svgcursors').querySelector('svg');
            if (currentPad === undefined) { 
                currentPad = "M " + x + " " + y;
                cursorsvg.innerHTML = '<path d="' + currentPad + ' L ' + (x + 4) + ' ' + (y + 4) + ' Z" />';
            } else {
                currentPad += " L " + x + " " + y;
                cursorsvg.innerHTML = '<path d="' + currentPad + ' Z" />';
            }
        };
        let endPath = (e) => {
            if (currentPad !== undefined) {
                let cursorsvg = document.getElementById('svgcursors').querySelector('svg');
                let imgsvg = document.getElementById('svgimg').querySelector('svg');
                currentPad += " Z";
                let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', currentPad);
                imgsvg.appendChild(path);
                currentPad = undefined;
                cursorsvg.innerHTML = '';
                selectElement(path);
                fillElements(getAutoSave);
                strokeElements(getAutoSave);
            } else {
                let el = e.target;
                selectElement(el);
            }
        };

        let nTaps = 0;
        let handleTaps = e => {
            nTaps++;
            if (nTaps === 1) {
                setTimeout(() => {
                    if (nTaps === 1 && !touchId2) {
                        drawPath(e);
                    }
                    if (nTaps === 2 && !touchId2) {
                        endPath(e);
                    }
                    nTaps = 0;
                }, 300);
            }
        };

        let inner = container.querySelector('.custom-touch-inner');
        let left = 0;
        let top = 0;
        let startWidth = inner.clientWidth;
        let panStarted = false;
        let startX = window.innerWidth / 2;
        let startY = window.innerHeight / 2;
        let startScale = 1;

        let prePanning = () => {
            if (panStarted) {
                return;
            }
            container.style.cursor = 'grab';
        };
        let startPanning = (x, y, scale) => {
            startX = x;
            startY = y;
            startScale = scale;
            panStarted = true;
        };
        let updatePanning = (x, y, scale) => {
            if (!panStarted) {
                return;
            }
            let dScale = scale / startScale;
            let dX = (x - startX);
            let dY = (y - startY);
            dX = dX + (left - startX) * (dScale - 1);
            dY = dY + (top - startY) * (dScale - 1);
            inner.style.left = (left + dX) + 'px';
            inner.style.top = (top + dY) + 'px';
            inner.style.width = (startWidth * dScale) + 'px';
            let cursor = dScale > 1 ? 'zoom-in' : dScale < 1 ? 'zoom-out' : 'grabbing';
            container.style.cursor = cursor;
            drawGridDots();
        };
        let stopPanning = () => {
            top = Number(inner.style.top.replace('px', ''));
            left = Number(inner.style.left.replace('px', ''));
            startWidth = inner.clientWidth;
            container.style.cursor = 'auto';
            panStarted = false;
        };
        let resetPanning = () => {
            left = 0;
            top = 0;
            startWidth = window.innerWidth;
            startPanning(0, 0, 1);
            updatePanning(0, 0, 1);
            stopPanning();
        };
        resetPanning();

        let oldOnViewOpen = window.onViewOpen;
        window.onViewOpen = e => {
            oldOnViewOpen(e);
            if (e.view === 'editor') {
                resetPanning();
            } else {
                deselectAllElements();
            }
        };

        // touch

        let touchId1 = undefined;
        let touchId2 = undefined;
        let touch1 = undefined;
        let touch2 = undefined;

        container.addEventListener('touchstart', e => {
            e.preventDefault();
            let touches = e.touches;
            if (touches.length > 1 && touchId1 === undefined && touchId2 === undefined) {
                touchId1 = touches[0].identifier;
                touchId2 = touches[1].identifier;
                touch1 = touches[0];
                touch2 = touches[1];
                let x = touch1.screenX + (touch2.screenX - touch1.screenX) / 2;
                let y = touch1.screenY + (touch2.screenY - touch1.screenY) / 2;
                let scale = Math.hypot(touch2.screenX - touch1.screenX, touch2.screenY - touch1.screenY);
                startPanning(x, y, scale);
            }
            if (touches.length === 1) {
                handleTaps(e);  
            }
        });
        container.addEventListener('touchmove', e => {
            e.preventDefault();
            let touches = e.touches;
            if (touches.length > 1 && touchId1 !== undefined && touchId2 !== undefined) {
                for (let i = 0; i < touches.length; i++) {
                    let touch = touches[i];
                    if (touch.identifier === touchId1) {
                        touch1 = touch;
                    } else if (touch.identifier === touchId2) {
                        touch2 = touch;
                    }
                }
                let x = touch1.screenX + (touch2.screenX - touch1.screenX) / 2;
                let y = touch1.screenY + (touch2.screenY - touch1.screenY) / 2;
                let scale = Math.hypot(touch2.screenX - touch1.screenX, touch2.screenY - touch1.screenY);
                updatePanning(x, y, scale);
                return;
            }
            dragNode(e);
        });
        container.addEventListener('touchend', e => {
            e.preventDefault();
            let touches = e.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                let touch = touches[i];
                if (touch.identifier === touchId1 || touch.identifier === touchId2) {
                    touchId1 = undefined;
                    touchId2 = undefined;
                    stopPanning();
                }
            }
            deselectNode();
        });

        // desktop
        let spaceDown = false;
        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;
        window.addEventListener('keydown', e => {
            if (e.keyCode === 32) {
                spaceDown = true;
                prePanning();
            }
        });
        window.addEventListener('keyup', e => {
            if (e.keyCode === 32) {
                spaceDown = false;
                stopPanning();
            }
        });
        container.addEventListener('mousedown', e => {
            e.preventDefault();
            if (spaceDown) {
                let x = e.screenX;
                let y = e.screenY;
                startPanning(x, y, 1);
            } else {
                handleTaps(e);
            }
        });
        container.addEventListener('mousemove', e => {
            e.preventDefault();
            if (panStarted) {
                mouseX = e.screenX;
                mouseY = e.screenY;
                updatePanning(mouseX, mouseY, 1);
                return;
            }
            if (currentNode) {
                dragNode(e);
            }
        });
        container.addEventListener('mouseup', e => {
            stopPanning();
            deselectNode();
        });
        container.addEventListener('mouseleave', e => {
            stopPanning();
            deselectNode();
        });
        let wheelTO = undefined;
        let wheelScale = 1;
        container.addEventListener('wheel', e => {
            e.preventDefault();
            if (e.ctrlKey) {
                if (!wheelTO) {
                    wheelScale = 1;
                    startPanning(mouseX, mouseY, wheelScale);
                } else {
                    clearTimeout(wheelTO);
                    wheelScale -= e.deltaY / 750;
                    wheelScale = Math.max(0.1, wheelScale);
                    updatePanning(mouseX, mouseY, wheelScale);
                }
                wheelTO = setTimeout(() => {
                    stopPanning();
                    wheelTO = undefined;
                }, 100);
            }
        });
    });
}
