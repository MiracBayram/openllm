use regex::Regex;
use std::collections::HashSet;
use std::sync::OnceLock;

static FLAG_CACHE: OnceLock<(HashSet<&'static str>, Regex)> = OnceLock::new();

fn get_cache() -> &'static (HashSet<&'static str>, Regex) {
    FLAG_CACHE.get_or_init(|| {
        let mut allowed_flags = HashSet::new();
        allowed_flags.insert("--ctx-size");
        allowed_flags.insert("--threads");
        allowed_flags.insert("--batch-size");
        allowed_flags.insert("-b");
        allowed_flags.insert("--ubatch-size");
        allowed_flags.insert("-ub");
        allowed_flags.insert("--rope-freq-base");
        allowed_flags.insert("--rope-freq-scale");
        allowed_flags.insert("--top-p");
        allowed_flags.insert("--top-k");
        allowed_flags.insert("--repeat-penalty");
        allowed_flags.insert("--seed");
        allowed_flags.insert("--mirostat");
        allowed_flags.insert("--mirostat-lr");
        allowed_flags.insert("--mirostat-ent");

        let re = Regex::new(r"(--[a-zA-Z0-9-]+|-b|-ub)\s+([a-zA-Z0-9._-]+)").unwrap();
        (allowed_flags, re)
    })
}

pub fn sanitize_advanced_flags(user_input: &str) -> Vec<String> {
    let (allowed_flags, re) = get_cache();
    let mut safe_args = Vec::new();

    for cap in re.captures_iter(user_input) {
        if let (Some(flag), Some(value)) = (cap.get(1), cap.get(2)) {
            if allowed_flags.contains(flag.as_str()) {
                safe_args.push(flag.as_str().to_string());
                safe_args.push(value.as_str().to_string());
            } else {
                tracing::warn!("Engellenen tehlikeli veya bilinmeyen flag: {}", flag.as_str());
            }
        }
    }
    safe_args
}
