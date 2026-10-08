# My Work bulk delete

`runBulk` returns the number of failed mutations. After a bulk delete the selection is cleared only when none failed; otherwise it is kept and pruned to still-listed rows, which leaves exactly the failed rows selected for a retry.
