pragma circom 2.1.6;

// Import the comparator library to do "greater than or equal to" math
include "./node_modules/circomlib/circuits/comparators.circom";

template CreditScoreCheck() {
    // --- INPUTS ---
    signal input score;       // Private: The actual credit score
    signal input threshold;   // Public: The minimum score required

    // --- OUTPUTS ---
    signal output isValid;    // Public: Will output 1 (true) or 0 (false)

    // GreaterEqThan(9) means we are comparing numbers up to 511 bits.
    // This is plenty for credit scores.
    component gte = GreaterEqThan(9); 
    gte.in[0] <== score;
    gte.in[1] <== threshold;

    // Output the result of the comparison
    isValid <== gte.out;

    // Enforce that isValid MUST be exactly 1. 
    // If the score is less than the threshold, proof generation fails.
    isValid === 1;
}

// Declare the main entry point and define which input is public
component main {public [threshold]} = CreditScoreCheck();