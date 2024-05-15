/**@target web */
export interface AlphaTabWebPackPluginOptions {
    /**
     * The location where alphaTab can be found.
     * (default: node_modules/@coderline/alphatab/dist)
     */
    alphaTabSourceDir?: string;

    /**
     * The location where assets of alphaTab should be placed. 
     * Set it to false to disable the copying of assets like fonts.
     * (default: compiler.options.output.path)
     */
    assetOutputDir?: string | false;

    /**
     * Whether alphaTab should configure the audio worklet support in WebPack.
     * This might break support for audio playback unless audio worklet support is added
     * through other means to WebPack. 
     * (default: true)
     */
    audioWorklets?: boolean;

    /**
     * Whether alphaTab should configure the web worklet support in WebPack.
     * This might break support for audio playback and background unless audio worklet support is added
     * through other means to WebPack. 
     * (default: true)
     */
    webWorkers?: boolean;
}