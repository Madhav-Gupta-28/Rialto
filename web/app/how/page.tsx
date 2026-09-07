"use client";

import Link from "next/link";
import Rise from "@/components/figures/Rise";
import StateMachine from "@/components/figures/StateMachine";

/**
 * The mechanics, for a reader who has already been convinced and now wants to
 * know how it is actually built. The landing page makes the argument; this page
 * answers the questions that argument raises.
 */
export default function How() {
  return (
    <>
      <section className="band void" style={{ paddingTop: 112, paddingBottom: 64 }}>
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h1 className="claim" style={{ fontSize: "clamp(32px,4.8vw,56px)" }}>
            A repo, rebuilt so a
            <br />
            <span className="dim">machine can underwrite it.</span>
          </h1>
          <p className="lede" style={{ maxWidth: "56ch" }}>
            Nothing here is novel finance. Repurchase agreements have settled bond markets for a century.
            What is new is that every part of one now happens on a public ledger — including the judgement.
          </p>
        </div>
      </section>

      {/* who is in the room */}
      <section className="band paper tight">
        <div className="wrap">
          <Rise>
            <p className="eyebrow">The parties</p>
            <h2 className="claim" style={{ fontSize: "clamp(24px,3.2vw,36px)" }}>Four, and one of them is the network.</h2>
            <div className="pair">
              <div>
                <h4>The issuer</h4>
                <p>
                  Creates the security through Asset Tokenization Studio and publishes its offering document
                  under a role-gated write. Keeps the power to pause, freeze and delist — and uses it.
                </p>
              </div>
              <div>
                <h4>The borrower</h4>
                <p>
                  Owns the bond and wants cash without selling it. Fixes the principal, the term and the
                  collateral. Never names a price.
                </p>
              </div>
              <div>
                <h4>The underwriter</h4>
                <p>
                  Has the cash. Publishes limits on chain, then either bids by hand or binds an agent key to
                  bid inside them. The contract cannot tell the two apart.
                </p>
              </div>
              <div>
                <h4>Hedera</h4>
                <p>
                  Not a venue — a participant. The market asks it at award to settle the loan at maturity,
                  and it does, paying its own fee, whether or not anyone is watching.
                </p>
              </div>
            </div>
          </Rise>
        </div>
      </section>

      {/* the lifecycle, with the calls */}
      <section className="band void">
        <div className="wrap">
          <Rise>
            <p className="eyebrow">One loan, end to end</p>
            <h2 className="claim" style={{ fontSize: "clamp(24px,3.2vw,36px)" }}>Six calls, and two of them are not yours.</h2>

            <div className="steps">
              <div className="step">
                <div>
                  <span className="who">Borrower</span>
                  <h4>Open the request</h4>
                  <p>
                    The collateral moves into escrow immediately, and the document hash is read off the
                    security rather than taken on the borrower&rsquo;s word — which is what binds every later
                    bid to the bytes the issuer published.
                  </p>
                  <span className="call">open(collateral, amount, cash, principal, term, window, docName)</span>
                </div>
              </div>

              <div className="step">
                <div>
                  <span className="who">Underwriter, or its agent</span>
                  <h4>Bid the repayment</h4>
                  <p>
                    Lowest wins. Every mandate limit is checked here, against the owner of the capital rather
                    than the key that signed — so a compromised agent key can do nothing its owner had not
                    already authorised.
                  </p>
                  <span className="call">bid(id, repayAmount, reasoningRef)</span>
                </div>
              </div>

              <div className="step">
                <div>
                  <span className="who">Anyone</span>
                  <h4>Award it</h4>
                  <p>
                    Permissionless, because the outcome is already fixed by state and there is nothing for a
                    caller to steer. Cash moves lender to borrower directly and never rests in the contract.
                    Hedera is asked, in the same transaction, to settle this loan at maturity.
                  </p>
                  <span className="call">award(id) → HSS.scheduleCall(claim, dueAt + 60)</span>
                </div>
              </div>

              <div className="step">
                <div>
                  <span className="who">The network</span>
                  <h4>Record any coupon that falls inside the term</h4>
                  <p>
                    Booked at award, the same way settlement is. The escrow is the holder of record while the
                    bond is pledged, so the security pays the market — and the market credits the borrower.
                  </p>
                  <span className="call">recordCoupon(id, couponId) · scheduled, unattended</span>
                </div>
              </div>

              <div className="step">
                <div>
                  <span className="who">Borrower, before the date</span>
                  <h4>Repay</h4>
                  <p>
                    The amount owed is the agreed repayment less any coupon the escrow collected. The pending
                    settlement call is deleted in the same transaction, so nothing fires later against a
                    closed position.
                  </p>
                  <span className="call">repay(id) → repaymentDue(id), not repayAmount</span>
                </div>
              </div>

              <div className="step">
                <div>
                  <span className="who">The network, after it</span>
                  <h4>Or settle it without being asked</h4>
                  <p>
                    Sixty seconds past the date, the scheduled call runs. It pays the lender recorded in
                    storage, never <code>msg.sender</code> — which is exactly why it is safe to hand to a
                    caller nobody chose.
                  </p>
                  <span className="call">claim(id) · scheduled=true · payer 0.0.10382007</span>
                </div>
              </div>
            </div>

            <figure className="figure">
              <StateMachine />
            </figure>
          </Rise>
        </div>
      </section>

      {/* the mandate */}
      <section className="band paper">
        <div className="wrap">
          <Rise>
            <p className="eyebrow">The mandate</p>
            <h2 className="claim" style={{ fontSize: "clamp(24px,3.2vw,36px)" }}>
              Authority is hard. Judgement is soft.
            </h2>
            <p className="lede" style={{ maxWidth: "56ch" }}>
              These are different things and this project keeps them apart. One is enforced by a contract and
              one is a paragraph of English you can rewrite over lunch.
            </p>
            <div className="pair">
              <div>
                <h4>Mandate · on chain, enforced</h4>
                <p style={{ fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 2 }}>
                  agent<br />
                  maxPerDeal<br />
                  maxTotal<br />
                  minRateBps<br />
                  maxTerm<br />
                  allowedAssets
                </p>
              </div>
              <div>
                <h4>Strategy · off chain, editable</h4>
                <p>
                  &ldquo;Senior secured paper only. Require the document to state seniority and a maturity
                  explicitly. Never bid when the loan runs past the instrument&rsquo;s maturity. Add 200bps
                  for an issuer you cannot identify. When anything material is unclear, do not bid.&rdquo;
                </p>
              </div>
            </div>
            <p className="sub" style={{ marginTop: 22, maxWidth: "56ch" }}>
              Standing bids count against the ceiling as well as funded positions. Without that, holding the
              best bid on twenty auctions would pass every limit check separately and breach the ceiling the
              moment they all awarded.
            </p>
          </Rise>
        </div>
      </section>

      {/* the coupon, worked */}
      <section className="band void">
        <div className="wrap">
          <Rise>
            <p className="eyebrow">The manufactured payment</p>
            <h2 className="claim" style={{ fontSize: "clamp(24px,3.2vw,36px)" }}>
              Worked, on a real loan.
            </h2>
            <p className="lede" style={{ maxWidth: "56ch" }}>
              Request #12. Two coupons fell inside a thirty-minute term, and the agent priced both of them
              into its bid <em>before</em> either had paid anything — from the coupon&rsquo;s own terms, not
              from a snapshot that did not exist yet.
            </p>

            <div className="figure">
              <div className="working">
                <div className="row"><span>principal</span><span>2,000.000000</span></div>
                <div className="row"><span>interest, 30 minutes</span><span>+0.007828</span></div>
                <div className="row"><span>coupon #10, projected at bid time</span><span>+28.767123</span></div>
                <div className="row"><span>coupon #11, projected at bid time</span><span>+28.767123</span></div>
                <div className="row total"><span>the agent bid</span><span>2,057.542074</span></div>
              </div>
              <p className="sub" style={{ margin: "26px 0 0" }}>
                Then the network recorded coupon #10 at its record date, and the borrower&rsquo;s obligation
                fell by exactly that amount. Coupon #11 was recorded by hand after the loan had already
                closed, so there was nothing left to net against — and it survived as a debt the lender paid
                out of pocket.
              </p>
              <div className="working" style={{ marginTop: 22 }}>
                <div className="row"><span>agreed repayment</span><span>2,057.542074</span></div>
                <div className="row"><span>coupon #10, netted at settlement</span><span>−28.767123</span></div>
                <div className="row"><span>coupon #11, paid by the lender after</span><span>−28.767123</span></div>
                <div className="row total"><span>the borrower&rsquo;s true cost</span><span>0.007828</span></div>
              </div>
              <figcaption style={{ textAlign: "left", marginTop: 20 }}>
                The interest, and nothing else. Every unit charged for income the escrow would collect came
                back to the borrower who never stopped owning the bond.
              </figcaption>
            </div>
          </Rise>
        </div>
      </section>

      {/* compliance */}
      <section className="band paper">
        <div className="wrap">
          <Rise>
            <p className="eyebrow">Compliance</p>
            <h2 className="claim" style={{ fontSize: "clamp(24px,3.2vw,36px)" }}>
              Four controls, and none of them can destroy a position.
            </h2>
            <div className="pair">
              <div>
                <h4>Pause</h4>
                <p>Halts every transfer of the token, so nothing settles. The collateral stays escrowed and the position stays open. Lifted, it completes.</p>
              </div>
              <div>
                <h4>Freeze an address</h4>
                <p>Removes it from the control list — <code>isFrozen</code> keeps reading false, which is why the interface reads a lens rather than the token.</p>
              </div>
              <div>
                <h4>Revoke KYC</h4>
                <p>An SSI credential with a validity window and an issuer, not a boolean. Settlement to that party stops until a new one is granted.</p>
              </div>
              <div>
                <h4>Delist the escrow</h4>
                <p>Both counterparties can be in perfect standing and nothing still moves, because the market itself is the sender of every settlement.</p>
              </div>
            </div>
            <p className="sub" style={{ marginTop: 24, maxWidth: "58ch" }}>
              A blocked party is told which permission is missing rather than reading a bare revert. That is
              what <code>ComplianceLens</code> is for — it takes no part in settlement and exists only to
              answer <em>why not</em>.
            </p>
          </Rise>
        </div>
      </section>

      {/* the negative space */}
      <section className="band void" style={{ borderBottom: "none" }}>
        <div className="wrap">
          <Rise>
            <p className="eyebrow">Deliberately absent</p>
            <h2 className="claim" style={{ fontSize: "clamp(24px,3.2vw,36px)" }}>
              What this does not have.
            </h2>
            <p className="lede" style={{ maxWidth: "56ch" }}>
              Easier to verify than anything it does have — search the contract and none of these appear.
            </p>

            <div className="nots">
              <div>
                <b>No price feed</b>
                <p>Not a single oracle read. The repayment is fixed at award by agreement, and every later branch depends on time and on whether the money arrived.</p>
              </div>
              <div>
                <b>No liquidator</b>
                <p>Nothing can be seized early, at any price, by anyone. The haircut agreed at award is the lender&rsquo;s whole protection, which is why it is theirs to choose.</p>
              </div>
              <div>
                <b>No margin call</b>
                <p>A position cannot be topped up or unwound mid-term. It has two endings and reaches one of them.</p>
              </div>
              <div>
                <b>No governance token</b>
                <p>No treasury, no emissions, no vote that could change the terms of a loan after it was struck.</p>
              </div>
              <div>
                <b>No custody</b>
                <p>Cash moves lender to borrower directly. The contract holds collateral and nothing else — check its cash balance, it is zero.</p>
              </div>
            </div>

            <div style={{ marginTop: 44, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link className="btn" href="/borrow">Raise cash against a security</Link>
              <Link className="btn ghost" href="/">See the market</Link>
            </div>
          </Rise>
        </div>
      </section>
    </>
  );
}
