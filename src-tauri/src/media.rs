use rustysynth::{MidiFile, MidiFileSequencer, SoundFont, Synthesizer, SynthesizerSettings};
use std::fs::File;
use std::io::Cursor;
use std::sync::Arc;

pub struct SoundEngine {
    soundfont_bytes: Option<Vec<u8>>,
}

impl SoundEngine {
    pub fn new() -> Self {
        Self {
            soundfont_bytes: None,
        }
    }

    pub fn load_soundfont(&mut self, data: Vec<u8>) {
        self.soundfont_bytes = Some(data);
    }

    pub fn render_midi_to_pcm(&self, midi_bytes: &[u8], sample_rate: i32) -> Result<Vec<f32>, String> {
        let sf_data = self.soundfont_bytes.as_ref().ok_or("No SoundFont loaded into engine")?;
        let mut sf_cursor = Cursor::new(sf_data);
        let sound_font = Arc::new(SoundFont::new(&mut sf_cursor).map_err(|e| format!("Failed to parse SoundFont: {:?}", e))?);

        let mut midi_cursor = Cursor::new(midi_bytes);
        let midi_file = Arc::new(MidiFile::new(&mut midi_cursor).map_err(|e| format!("Failed to parse MIDI file: {:?}", e))?);

        let settings = SynthesizerSettings::new(sample_rate);
        let synthesizer = Synthesizer::new(&sound_font, &settings).map_err(|e| format!("Synthesizer error: {:?}", e))?;
        let mut sequencer = MidiFileSequencer::new(synthesizer);

        sequencer.play(&midi_file, false);

        let mut left: Vec<f32> = Vec::new();
        let mut right: Vec<f32> = Vec::new();
        let buffer_size = (sample_rate / 10) as usize; // 100ms chunks
        let mut buf_l = vec![0.0f32; buffer_size];
        let mut buf_r = vec![0.0f32; buffer_size];

        while !sequencer.end_of_sequence() {
            sequencer.render(&mut buf_l[..], &mut buf_r[..]);
            left.extend_from_slice(&buf_l);
            right.extend_from_slice(&buf_r);
        }

        // Interleave stereo into one PCM float vector
        let mut interleaved = Vec::with_capacity(left.len() * 2);
        for i in 0..left.len() {
            interleaved.push(left[i]);
            interleaved.push(right[i]);
        }

        Ok(interleaved)
    }
}
