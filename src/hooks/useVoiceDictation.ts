import { useState, useRef, useCallback, useEffect } from 'react';

// Wraps the browser's built-in speech recognition (Web Speech API).
// Works well on Android Chrome; support on iOS/desktop Safari varies
// and Firefox has none, so isSupported lets callers hide/disable the
// mic button gracefully instead of crashing.
//
// Two known rough edges of the free browser engine, addressed here:
// 1. It stops after a short pause even with continuous=true (an
//    implementation quirk, not a setting) - we auto-restart it
//    behind the scenes so a long dictation doesn't get cut off
//    mid-sentence. The person sees one uninterrupted session.
// 2. It never inserts punctuation on its own - there is no "auto
//    punctuation" mode to turn on. The only way to get punctuation
//    at all is for the person to say it, so we recognize spoken
//    punctuation words ("comma", "full stop", "new line", etc.) and
//    convert them to the actual marks.
const PUNCTUATION_WORDS: [RegExp, string][] = [
  [/\bnew paragraph\b/gi, '\n\n'],
  [/\bnew line\b/gi, '\n'],
  [/\bfull stop\b/gi, '.'],
  [/\bperiod\b/gi, '.'],
  [/\bcomma\b/gi, ','],
  [/\bquestion mark\b/gi, '?'],
  [/\bexclamation mark\b/gi, '!'],
  [/\bcolon\b/gi, ':'],
  [/\bsemi ?colon\b/gi, ';'],
  [/\bopen bracket\b/gi, '('],
  [/\bclose bracket\b/gi, ')'],
  [/\bdash\b/gi, '-'],
];

function applySpokenPunctuation(raw: string): string {
  let text = raw;
  for (const [pattern, mark] of PUNCTUATION_WORDS) {
    text = text.replace(pattern, mark);
  }
  // Clean up: no space before punctuation, single space after, no
  // duplicate spaces left over from word removal.
  text = text.replace(/\s+([,.!?;:])/g, '$1');
  text = text.replace(/([,.!?;:])(?=\S)/g, '$1 ');
  text = text.replace(/\s{2,}/g, ' ');
  text = text.replace(/\s+\n/g, '\n').replace(/\n\s+/g, '\n');
  return text.trim();
}

export function useVoiceDictation(onFinalResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<any>(null);
  const intentionalStopRef = useRef(false);
  const onResultRef = useRef(onFinalResult);
  onResultRef.current = onFinalResult;

  const SpeechRecognitionCtor =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;
  const isSupported = !!SpeechRecognitionCtor;

  useEffect(() => {
    return () => {
      intentionalStopRef.current = true;
      recognitionRef.current?.stop?.();
    };
  }, []);

  const createRecognition = useCallback(() => {
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-NG';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const punctuated = applySpokenPunctuation(transcript.trim());
          if (punctuated) onResultRef.current(punctuated);
        } else {
          interim += transcript;
        }
      }
      setInterimText(interim);
    };
    recognition.onerror = (event: any) => {
      // 'no-speech' fires often during natural pauses - not a real
      // error, the auto-restart in onend handles it seamlessly.
      if (event.error !== 'no-speech') {
        intentionalStopRef.current = true;
        setIsListening(false);
        setInterimText('');
      }
    };
    recognition.onend = () => {
      if (intentionalStopRef.current) {
        setIsListening(false);
        setInterimText('');
        return;
      }
      // Engine stopped on its own (its internal pause-detection) -
      // restart immediately so the session feels continuous.
      try {
        recognition.start();
      } catch {
        setIsListening(false);
        setInterimText('');
      }
    };
    return recognition;
  }, [SpeechRecognitionCtor]);

  const startListening = useCallback(() => {
    if (!isSupported) return;
    intentionalStopRef.current = false;
    const recognition = createRecognition();
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported, createRecognition]);

  const stopListening = useCallback(() => {
    intentionalStopRef.current = true;
    recognitionRef.current?.stop?.();
    setIsListening(false);
    setInterimText('');
  }, []);

  return { isSupported, isListening, interimText, startListening, stopListening };
}

// Converts a spoken amount ("five thousand naira", "twelve hundred",
// "3000") into a plain number string, for fields like consultation
// fee where voice input should end up numeric rather than as text.
export function parseSpokenAmount(text: string): string | null {
  const cleaned = text.toLowerCase().replace(/naira|kobo|only/g, '').trim();

  // Already digits (possibly with commas/decimals)
  const digitMatch = cleaned.match(/[\d,]+(\.\d+)?/);
  if (digitMatch && /\d/.test(cleaned.replace(/[a-z\s]/g, ''))) {
    const numeric = digitMatch[0].replace(/,/g, '');
    if (!isNaN(parseFloat(numeric))) return numeric;
  }

  const units: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19,
  };
  const tens: Record<string, number> = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
    eighty: 80, ninety: 90,
  };
  const scales: Record<string, number> = {
    hundred: 100, thousand: 1000, million: 1000000,
  };

  const words = cleaned.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  let total = 0;
  let current = 0;
  let matchedAny = false;

  for (const word of words) {
    if (word in units) {
      current += units[word];
      matchedAny = true;
    } else if (word in tens) {
      current += tens[word];
      matchedAny = true;
    } else if (word in scales) {
      current = (current || 1) * scales[word];
      if (scales[word] >= 1000) {
        total += current;
        current = 0;
      }
      matchedAny = true;
    } else if (word === 'and') {
      continue;
    } else {
      // Unrecognized word — bail rather than guess.
      return null;
    }
  }
  total += current;
  return matchedAny ? String(total) : null;
}
