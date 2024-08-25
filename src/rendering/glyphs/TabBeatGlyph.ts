import { Duration } from '@src/model/Duration';
import { GraceType } from '@src/model/GraceType';
import { Note } from '@src/model/Note';
import { TabRhythmMode } from '@src/NotationSettings';
import { BeatOnNoteGlyphBase } from '@src/rendering/glyphs/BeatOnNoteGlyphBase';
import { CircleGlyph } from '@src/rendering/glyphs/CircleGlyph';
import { Glyph } from '@src/rendering/glyphs/Glyph';
import { NoteNumberGlyph } from '@src/rendering/glyphs/NoteNumberGlyph';
import { SpacingGlyph } from '@src/rendering/glyphs/SpacingGlyph';
import { TabNoteChordGlyph } from '@src/rendering/glyphs/TabNoteChordGlyph';
import { TabRestGlyph } from '@src/rendering/glyphs/TabRestGlyph';
import { TabWhammyBarGlyph } from '@src/rendering/glyphs/TabWhammyBarGlyph';
import { TremoloPickingGlyph } from '@src/rendering/glyphs/TremoloPickingGlyph';
import { TabBarRenderer } from '@src/rendering/TabBarRenderer';
import { NoteXPosition, NoteYPosition } from '@src/rendering/BarRendererBase';
import { BeatBounds } from '@src/rendering/utils/BeatBounds';
import { SlashNoteHeadGlyph } from './SlashNoteHeadGlyph';

export class TabBeatGlyph extends BeatOnNoteGlyphBase {
    public slash: SlashNoteHeadGlyph | null = null;
    public noteNumbers: TabNoteChordGlyph | null = null;
    public restGlyph: TabRestGlyph | null = null;

    public override getNoteX(note: Note, requestedPosition: NoteXPosition): number {
        return this.noteNumbers ? this.noteNumbers.getNoteX(note, requestedPosition) : 0;
    }

    public override getNoteY(note: Note, requestedPosition: NoteYPosition): number {
        return this.noteNumbers ? this.noteNumbers.getNoteY(note, requestedPosition) : 0;
    }

    public override buildBoundingsLookup(beatBounds: BeatBounds, cx: number, cy: number) {
        if (this.noteNumbers) {
            this.noteNumbers.buildBoundingsLookup(beatBounds, cx + this.x, cy + this.y);
        }
    }

    public override doLayout(): void {
        let tabRenderer: TabBarRenderer = this.renderer as TabBarRenderer;

        if (!this.container.beat.isRest) {
            //
            // Note numbers
            let isGrace: boolean =
                this.renderer.settings.notation.smallGraceTabNotes && this.container.beat.graceType !== GraceType.None;

            let beatEffects: Map<string, Glyph>;

            if (this.container.beat.slashed && !this.container.beat.notes.some(x => x.isTieDestination as boolean)) {
                const line = Math.floor((this.renderer.bar.staff.tuning.length - 1) / 2);
                const slashY = tabRenderer.getLineY(line);
                const slashNoteHead = new SlashNoteHeadGlyph(0, slashY, this.container.beat.duration, isGrace);
                this.slash = slashNoteHead;
                slashNoteHead.beat = this.container.beat;
                slashNoteHead.beamingHelper = this.beamingHelper;
                this.addGlyph(slashNoteHead);
                beatEffects = slashNoteHead.beatEffects;
            } else {
                const tabNoteNumbers = new TabNoteChordGlyph(0, 0, isGrace);
                this.noteNumbers = tabNoteNumbers;
                tabNoteNumbers.beat = this.container.beat;
                tabNoteNumbers.beamingHelper = this.beamingHelper;
                for (let note of this.container.beat.notes) {
                    if (note.isVisible) {
                        this.createNoteGlyph(note);
                    }
                }
                this.addGlyph(tabNoteNumbers);
                beatEffects = tabNoteNumbers.beatEffects;
            }

            //
            // Whammy Bar
            if (this.container.beat.hasWhammyBar) {
                let whammy: TabWhammyBarGlyph = new TabWhammyBarGlyph(this.container.beat);
                whammy.renderer = this.renderer;
                whammy.doLayout();
                this.container.ties.push(whammy);
            }
            //
            // Tremolo Picking
            if (this.container.beat.isTremolo && !beatEffects.has('tremolo')) {
                let offset: number = 0;
                let speed = this.container.beat.tremoloSpeed!;
                let tremoloX = 5 * this.scale;
                switch (speed) {
                    case Duration.ThirtySecond:
                        offset = 10;
                        break;
                    case Duration.Sixteenth:
                        offset = 5;
                        break;
                    case Duration.Eighth:
                        offset = 0;
                        break;
                }

                if (this.container.beat.duration < Duration.Half) {
                    tremoloX = 0;
                }

                beatEffects.set('tremolo', new TremoloPickingGlyph(tremoloX, offset * this.scale, speed));
            }
            //
            // Note dots
            //
            if (this.container.beat.dots > 0 && tabRenderer.settings.notation.rhythmMode !== TabRhythmMode.Hidden) {
                this.addGlyph(new SpacingGlyph(0, 0, 5 * this.scale));
                for (let i: number = 0; i < this.container.beat.dots; i++) {
                    this.addGlyph(
                        new CircleGlyph(
                            0,
                            tabRenderer.lineOffset * tabRenderer.bar.staff.tuning.length +
                                tabRenderer.settings.notation.rhythmHeight * tabRenderer.scale,
                            1.5 * this.scale
                        )
                    );
                }
            }
        } else {
            let line = Math.floor((this.renderer.bar.staff.tuning.length - 1) / 2);
            let y: number = tabRenderer.getTabY(line);
            const restGlyph = new TabRestGlyph(0, y, tabRenderer.showRests, this.container.beat.duration);
            this.restGlyph = restGlyph;
            restGlyph.beat = this.container.beat;
            restGlyph.beamingHelper = this.beamingHelper;
            this.addGlyph(restGlyph);
            //
            // Note dots
            //
            if (this.container.beat.dots > 0 && tabRenderer.showRests) {
                this.addGlyph(new SpacingGlyph(0, 0, 5 * this.scale));
                for (let i: number = 0; i < this.container.beat.dots; i++) {
                    this.addGlyph(new CircleGlyph(0, y, 1.5 * this.scale));
                }
            }
        }
        // left to right layout
        if (!this.glyphs) {
            return;
        }
        let w: number = 0;
        for (let i: number = 0, j: number = this.glyphs.length; i < j; i++) {
            let g: Glyph = this.glyphs[i];
            g.x = w;
            g.renderer = this.renderer;
            g.doLayout();
            w += g.width;
        }
        this.width = w;
        this.computedWidth = w;
        if (this.container.beat.isEmpty) {
            this.centerX = this.width / 2;
        } else if (this.restGlyph) {
            this.centerX = this.restGlyph!.x + this.restGlyph!.width / 2;
        } else if (this.noteNumbers) {
            this.centerX = this.noteNumbers!.x + this.noteNumbers!.noteStringWidth / 2;
        } else if (this.slash) {
            this.centerX = this.slash!.x + this.slash!.width / 2;
        }
    }

    public override updateBeamingHelper(): void {
        if (this.noteNumbers) {
            this.noteNumbers.updateBeamingHelper(this.container.x + this.x);
        } else if (this.restGlyph) {
            this.restGlyph.updateBeamingHelper(this.container.x + this.x);
        } else if (this.slash) {
            this.slash.updateBeamingHelper(this.container.x + this.x);
        }
    }

    private createNoteGlyph(n: Note): void {
        let tr: TabBarRenderer = this.renderer as TabBarRenderer;
        let noteNumberGlyph: NoteNumberGlyph = new NoteNumberGlyph(0, 0, n);
        let l: number = n.beat.voice.bar.staff.tuning.length - n.string;
        noteNumberGlyph.y = tr.getTabY(l);
        noteNumberGlyph.renderer = this.renderer;
        noteNumberGlyph.doLayout();
        this.noteNumbers!.addNoteGlyph(noteNumberGlyph, n);
        let topY = noteNumberGlyph.y - noteNumberGlyph.height / 2;
        let bottomY = topY + noteNumberGlyph.height;
        this.renderer.helpers.collisionHelper.reserveBeatSlot(this.container.beat, topY, bottomY);
    }
}
