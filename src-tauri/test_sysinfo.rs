fn main() {
    let mut s = sysinfo::System::new();
    s.refresh_memory();
    s.refresh_cpu_usage();
}
