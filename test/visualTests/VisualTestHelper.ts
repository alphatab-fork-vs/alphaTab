import { ScoreLoader } from '@src/importer/ScoreLoader';
import { Score } from '@src/model/Score';
import { Settings } from '@src/Settings';
import { TestPlatform } from '@test/TestPlatform';
import { Environment } from '@src/Environment';
import { RenderFinishedEventArgs } from '@src/rendering/RenderFinishedEventArgs';
import { AlphaTexImporter } from '@src/importer/AlphaTexImporter';
import { ByteBuffer } from '@src/io/ByteBuffer';
import { PixelMatch, PixelMatchOptions } from '@test/visualTests/PixelMatch';
import { JsonConverter } from '@src/model/JsonConverter';
import { assert } from 'chai';
import { GlobalFonts, createCanvas, Image, Canvas } from '@napi-rs/canvas';
import { AlphaTabApiBase } from '@src/AlphaTabApiBase';
import { TestUiFacade } from './TestUiFacade';
import * as path from 'path';

/**
 * @partial
 */
export class VisualTestHelper {
    public static async runVisualTest(
        inputFile: string,
        settings?: Settings,
        tracks?: number[],
        message?: string,
        tolerancePercent: number = 1,
        triggerResize: boolean = false
    ): Promise<void> {
        try {
            const inputFileData = await TestPlatform.loadFile(`test-data/visual-tests/${inputFile}`);
            const referenceFileName = TestPlatform.changeExtension(inputFile, '.png');
            let score: Score = ScoreLoader.loadScoreFromBytes(inputFileData, settings);

            await VisualTestHelper.runVisualTestScore(
                score,
                referenceFileName,
                settings,
                tracks,
                message,
                tolerancePercent,
                triggerResize
            );
        } catch (e) {
            assert.fail(`Failed to run visual test ${e}`);
        }
    }

    public static async runVisualTestWithResize(
        inputFile: string,
        widths: number[],
        referenceImages: string[],
        settings?: Settings,
        tracks?: number[],
        message?: string,
        tolerancePercent: number = 1
    ): Promise<void> {
        try {
            const inputFileData = await TestPlatform.loadFile(`test-data/visual-tests/${inputFile}`);
            let score: Score = ScoreLoader.loadScoreFromBytes(inputFileData, settings);

            await VisualTestHelper.runVisualTestScoreWithResize(
                score,
                widths,
                referenceImages,
                settings,
                tracks,
                message,
                tolerancePercent
            );
        } catch (e) {
            assert.fail(`Failed to run visual test ${e}`);
        }
    }

    public static async runVisualTestTex(
        tex: string,
        referenceFileName: string,
        settings?: Settings,
        tracks?: number[],
        message?: string,
        tolerancePercent: number = 1
    ): Promise<void> {
        try {
            if (!settings) {
                settings = new Settings();
            }

            const importer = new AlphaTexImporter();
            importer.init(ByteBuffer.fromString(tex), settings);
            let score: Score = importer.readScore();

            await VisualTestHelper.runVisualTestScore(score, referenceFileName, settings, tracks, message, tolerancePercent);
        } catch (e) {
            assert.fail(`Failed to run visual test ${e}`);
        }
    }

    public static async runVisualTestScore(
        score: Score,
        referenceFileName: string,
        settings?: Settings,
        tracks?: number[],
        message?: string,
        tolerancePercent: number = 1,
        triggerResize: boolean = false
    ): Promise<void> {
        const widths = [1300];
        if (triggerResize) {
            widths.push(widths[0]);
        }

        const referenceImages: (string | null)[] = [referenceFileName];
        if (triggerResize) {
            referenceImages.unshift(null);
        }

        await VisualTestHelper.runVisualTestScoreWithResize(
            score,
            widths,
            referenceImages,
            settings,
            tracks,
            message,
            tolerancePercent
        );
    }

    /**
     * @target web
     * @partial
     */
    public static async runVisualTestScoreWithResize(
        score: Score,
        widths: number[],
        referenceImages: (string | null)[],
        settings?: Settings,
        tracks?: number[],
        message?: string,
        tolerancePercent: number = 1
    ): Promise<void> {
        try {
            if (!settings) {
                settings = new Settings();
            }
            if (!tracks) {
                tracks = [0];
            }

            await VisualTestHelper.enableNodeCanvas();
            await VisualTestHelper.prepareSettingsForTest(settings);

            let referenceFileData: (Uint8Array | null)[] = [];
            for (const img of referenceImages) {
                try {
                    if (img !== null) {
                        referenceFileData.push(await TestPlatform.loadFile(`test-data/visual-tests/${img}`));
                    } else {
                        referenceFileData.push(null);
                    }
                } catch (e) {
                    referenceFileData.push(new Uint8Array(0));
                }
            }

            let results: RenderFinishedEventArgs[][] = [];
            let totalWidths: number[] = [];
            let totalHeights: number[] = [];
            const uiFacade = new TestUiFacade();
            uiFacade.rootContainer.width = widths.shift()!;

            let render = new Promise<void>((resolve, reject) => {
                const api = new AlphaTabApiBase<unknown>(uiFacade, settings);
                api.renderStarted.on(_ => {
                    results.push([]);
                    totalWidths.push(0);
                    totalHeights.push(0);
                });
                api.renderer.partialRenderFinished.on(e => {
                    if (e) {
                        results[results.length - 1].push(e);
                    }
                });
                api.renderer.renderFinished.on(e => {
                    totalWidths[totalWidths.length - 1] = e.totalWidth;
                    totalHeights[totalHeights.length - 1] = e.totalHeight;
                    results[results.length - 1].push(e);

                    if (widths.length > 0) {
                        uiFacade.rootContainer.width = widths.shift()!;
                        // @ts-ignore
                        api.triggerResize();
                    } else {
                        resolve();
                    }
                });
                api.error.on(e => {
                    reject(`Failed to render image: ${e}`);
                });

                // NOTE: on some platforms we serialize/deserialize the score objects
                // this logic does the same just to ensure we get the right result
                const renderScore = JsonConverter.jsObjectToScore(JsonConverter.scoreToJsObject(score), settings);
                api.renderScore(renderScore, tracks);
            });

            await Promise.race([
                render,
                new Promise<void>((_, reject) => {
                    setTimeout(() => {
                        reject(new Error('Rendering did not complete in time'));
                    }, 2000 * widths.length);
                })
            ]);

            for (let i = 0; i < results.length; i++) {
                if (referenceImages[i] !== null) {
                    await VisualTestHelper.compareVisualResult(
                        totalWidths[i],
                        totalHeights[i],
                        results[i],
                        referenceImages[i]!,
                        referenceFileData[i]!,
                        message,
                        tolerancePercent
                    );
                }
            }
        } catch (e) {
            assert.fail(`Failed to run visual test ${e}`);
        }
    }

    /**
     * @target web
     */
    private static _nodeCanvasEnabled: boolean = false;

    /**
    * @target web
    */
    static async enableNodeCanvas() {
        if (VisualTestHelper._nodeCanvasEnabled) {
            return;
        }

        Environment.enableNodeCanvas('skia', 'Bravura', Environment.MusicFontSize,
            (w, h) => createCanvas(w, h));


        const fontDirs = [
            'font/roboto/',
            'font/ptserif/',
            'font/bravura/'
        ];

        for (const font of fontDirs) {
            let fonts = GlobalFonts.loadFontsFromDir(font);
            if (fonts === 0) {
                throw new Error('Failed to load font from ' + font)
            }
        }

        const loadedFonts = GlobalFonts.families;
        for (const loadedFont of loadedFonts) {
            console.log('Available fonts: ', loadedFont);
        }

        VisualTestHelper._nodeCanvasEnabled = true;
    }

    /**
     * @target web
     * @partial
     */
    static async prepareSettingsForTest(settings: Settings) {
        settings.core.fontDirectory = 'font/bravura/';
        settings.core.engine = 'skia';
        Environment.HighDpiFactor = 1; // test data is in scale 1
        settings.core.enableLazyLoading = false;

        settings.display.resources.copyrightFont.families = ['Roboto'];
        settings.display.resources.titleFont.families = ['PT Serif'];
        settings.display.resources.subTitleFont.families = ['PT Serif'];
        settings.display.resources.wordsFont.families = ['PT Serif'];
        settings.display.resources.effectFont.families = ['PT Serif'];
        settings.display.resources.fretboardNumberFont.families = ['Roboto'];
        settings.display.resources.tablatureFont.families = ['Roboto'];
        settings.display.resources.graceFont.families = ['Roboto'];
        settings.display.resources.barNumberFont.families = ['Roboto'];
        settings.display.resources.fingeringFont.families = ['PT Serif'];
        settings.display.resources.markerFont.families = ['PT Serif'];
    }

    /**
     * @target web
     * @partial
     */
    private static convertPngToCanvas(
        data: Uint8Array,
    ): Promise<Canvas> {
        return new Promise<Canvas>((resolve, reject) => {
            if (data.length === 0) {
                resolve(createCanvas(1, 1));
            } else {
                try {
                    const img = new Image();
                    img.src = Buffer.from(data);

                    const w = img.naturalWidth;
                    const h = img.naturalHeight;
                    const canvas = createCanvas(w, h)
                    const context = canvas.getContext('2d')!;
                    context.drawImage(img, 0, 0);
                    resolve(canvas);
                    img.onerror = function (e) {
                        reject(e);
                    };
                }
                catch (e) {
                    reject(e);
                }
            }
        });
    }

    /**
     * @target web
     * @partial
     */
    private static convertSvgToImage(svg: string): Promise<Image> {
        return new Promise<Image>((resolve, reject) => {
            try {
                const img = new Image();
                img.src = Buffer.from(svg);
                resolve(img);
            }
            catch (e) {
                reject(e);
            }
        });
    }

    /**
     * @target web
     * @partial
     */
    public static async compareVisualResult(
        totalWidth: number,
        totalHeight: number,
        result: RenderFinishedEventArgs[],
        referenceFileName: string,
        referenceFileData: Uint8Array,
        message?: string,
        tolerancePercent: number = 1
    ): Promise<void> {
        // create final full image
        const actual = createCanvas(totalWidth, totalHeight);
        const actualImageContext = actual.getContext('2d')!;
        for (const partialResult of result) {
            const partialCanvas = partialResult.renderResult;

            let imageSource: Canvas | Image | null = null;
            if (partialCanvas instanceof Canvas) {
                imageSource = partialCanvas;
            } else if (typeof partialCanvas === 'string') {
                imageSource = await VisualTestHelper.convertSvgToImage(partialCanvas);
            }

            if (imageSource) {
                actualImageContext.drawImage(imageSource, partialResult.x, partialResult.y);
            }
        }

        // convert reference image to canvas
        const expected = await VisualTestHelper.convertPngToCanvas(
            referenceFileData
        );

        await VisualTestHelper.expectToEqualVisuallyAsync(actual, expected, referenceFileName, message, tolerancePercent);
    }

    /**
     * @target web
     * @partial
     */
    private static async expectToEqualVisuallyAsync(
        actual: Canvas,
        expected: Canvas,
        expectedFileName: string,
        message?: string,
        tolerancePercent: number = 1
    ): Promise<void> {
        const sizeMismatch = expected.width !== actual.width || expected.height !== actual.height;
        const oldActual = actual;
        if (sizeMismatch) {
            const newActual = createCanvas(expected.width, expected.height);
            const newActualContext = newActual.getContext('2d')!;
            newActualContext.drawImage(actual as Canvas, 0, 0);
            newActualContext.strokeStyle = 'red';
            newActualContext.lineWidth = 2;
            newActualContext.strokeRect(0, 0, newActual.width, newActual.height);

            actual = newActual;
        }

        const actualImageData = actual.getContext('2d')!.getImageData(0, 0, actual.width, actual.height);

        const expectedImageData = expected
            .getContext('2d')!
            .getImageData(0, 0, expected.width, expected.height);

        // do visual comparison
        const diff = createCanvas(expected.width, expected.height);
        const diffContext = diff.getContext('2d')!;
        const diffImageData = diffContext.createImageData(diff.width, diff.height);
        const result = {
            pass: true,
            message: ''
        };

        try {
            let match = PixelMatch.match(
                new Uint8Array(expectedImageData.data.buffer),
                new Uint8Array(actualImageData.data.buffer),
                new Uint8Array(diffImageData.data.buffer),
                expected.width,
                expected.height,
                {
                    threshold: 0.3,
                    includeAA: false,
                    diffMask: true,
                    alpha: 1
                } as PixelMatchOptions
            );

            diffContext.putImageData(diffImageData, 0, 0);

            // only pixels that are not transparent are relevant for the diff-ratio
            let totalPixels = match.totalPixels - match.transparentPixels;
            let percentDifference = (match.differentPixels / totalPixels) * 100;
            result.pass = percentDifference < tolerancePercent;
            // result.pass = match.differentPixels === 0;
            result.message = '';

            if (!result.pass) {
                let percentDifferenceText = percentDifference.toFixed(2);
                result.message = `Difference between original and new image is too big: ${match.differentPixels}/${totalPixels} (${percentDifferenceText}%)`;
                await VisualTestHelper.saveFiles(expectedFileName, oldActual, diff);
            }

            if (sizeMismatch) {
                result.message += `Image sizes do not match: expected ${expected.width}x${expected.height} but got ${oldActual.width}x${oldActual.height}`;
                result.pass = false;
            }
        } catch (e) {
            result.pass = false;
            result.message = `Error comparing images: ${e}, ${message}`;
        }

        if (!result.pass) {
            throw new Error(result.message);
        }
    }

    /**
     * @target web
     * @partial
     */
    static async saveFiles(
        expectedFilePath: string,
        actual: Canvas,
        diff: Canvas
    ): Promise<void> {
        expectedFilePath = path.join(
            'test-data',
            'visual-tests',
            ...expectedFilePath.split(/[\\\/]/)
        );

        const actualData = await VisualTestHelper.toPngBlob(actual);
        const diffData = await VisualTestHelper.toPngBlob(diff);

        const diffFileName = path.format({ ...path.parse(expectedFilePath), base: '', ext: '.diff.png' });
        await TestPlatform.saveFile(diffFileName, diffData);

        const actualFile = path.format({ ...path.parse(expectedFilePath), base: '', ext: '.new.png' });
        await TestPlatform.saveFile(actualFile, actualData);
    }

    /**
     * @target web
     */
    static toPngBlob(canvas: Canvas): Promise<Buffer> {
        return canvas.encode('png')
    }

    static createFileName(oldName: string, part: string) {
        oldName = oldName.split('\\').join('/');
        let i = oldName.lastIndexOf('/');
        if (i >= 0) {
            oldName = oldName.substr(i + 1);
        }

        if (part.length > 0) {
            part = `-${part}`;
        }

        i = oldName.lastIndexOf('.');
        if (i >= 0) {
            oldName = oldName.substr(0, i) + part + oldName.substr(i);
        } else {
            oldName += part;
        }
        return oldName;
    }
}
