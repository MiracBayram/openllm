#[inline]
pub fn fast_extract_content(line: &[u8]) -> Option<&[u8]> {
    let pat = b"\"content\":\"";
    let mut i = 0;
    while i + pat.len() <= line.len() {
        if &line[i..i + pat.len()] == pat {
            let start = i + pat.len();
            let mut j = start;
            while j < line.len() {
                if line[j] == b'\\' { j += 2; continue; }
                if line[j] == b'"' { return Some(&line[start..j]); }
                j += 1;
            }
        }
        i += 1;
    }
    None
}
