pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";

template CreditScore() {
    signal input tx_count;
    signal input balance_xlm;
    signal input age_days;
    signal input unique_assets;
    signal input threshold;

    signal output out;

    signal score;
    score <== tx_count * 3 + balance_xlm * 2 + age_days + unique_assets * 10;

    component gte = GreaterEqThan(15);
    gte.in[0] <== score;
    gte.in[1] <== threshold;
    out <== gte.out;
}

component main = CreditScore();
