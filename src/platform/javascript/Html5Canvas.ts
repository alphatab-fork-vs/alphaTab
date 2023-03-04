import { Environment } from '@src/Environment';
import { WebRasterCanvas } from './WebRasterCanvas';

/**
 * A canvas implementation for HTML5 canvas
 * @target web
 */
export class Html5Canvas extends WebRasterCanvas {
    public constructor() {
        let fontElement: HTMLElement = document.createElement('span');
        fontElement.classList.add('at');
        document.body.appendChild(fontElement);
        let style: CSSStyleDeclaration = window.getComputedStyle(fontElement);
        let family: string = style.fontFamily;
        if (family.startsWith('"') || family.startsWith("'")) {
            family = family.substr(1, family.length - 2);
        }
        super(family, parseFloat(style.fontSize), Html5Canvas.createCanvasElement);
    }

    private static createCanvasElement(width: number, height: number) {
        const canvas = document.createElement('canvas');
        canvas.width = width * Environment.HighDpiFactor;
        canvas.height = width * Environment.HighDpiFactor;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        return canvas;
    }
}
