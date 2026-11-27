//! Snapvere by Brendigo — isolated native staging and transaction CLI.
#[path = "support/delta_codec.rs"]
mod delta_codec;
#[path = "support/update_transaction.rs"]
mod update_transaction;

use delta_codec::{checked_file, hash_file, invalid, stage, validate_header, Header, MAX_BYTES};
use std::io;

fn main() -> io::Result<()> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.first().is_some_and(|arg| arg == "workspace") {
        update_transaction::run(&args[1..])
    } else {
        stage(&args).map(|_| ())
    }
}
