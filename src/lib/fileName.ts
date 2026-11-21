/**
 * A document number as it can sit in a file name. A file name cannot hold "/", "\" or ":", so each is swapped for the
 * look-alike letter that can (∕ ⧵ ꞉): the receiver reads the same number the document has (PO/26-27/0006 stays
 * PO∕26-27∕0006). A number with a dash, underscore, dot or no separator is kept exactly as it is.
 */
export const fileSafe = (number: string) => number.replace(/\//g, '∕').replace(/\\/g, '⧵').replace(/:/g, '꞉');
