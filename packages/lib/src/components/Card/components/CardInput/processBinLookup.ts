import { createCardVariantSwitcher } from './utils';
import { BinLookupResponse } from '../../types';

// Based on values in binValueObject we might need to trigger additional markup
// e.g. a selector for brands or to choose between credit/debit card variations
export default function processBinLookupResponse(binLookupResponse: BinLookupResponse): void {
    // RESET: The number of digits in number field has dropped below threshold for BIN lookup - so reset the UI & inform SFP
    if (!binLookupResponse) {
        this.resetAdditionalSelectState();
        this.sfp.current.processBinLookupResponse(binLookupResponse);
        return;
    }

    // RESULT: binLookup has found a result so proceed accordingly
    if (binLookupResponse.supportedBrands?.length) {
        // 1) Multiple options found - add to the UI & inform SFP
        if (binLookupResponse.supportedBrands.length > 1) {
            // --
            const switchObj = createCardVariantSwitcher(binLookupResponse.supportedBrands);

            // Set properties on state to trigger a Select element in the UI
            this.setState(switchObj.stateObject); // Don't need to call validateCardInput - this will be called by the brandChange from SFP

            // Pass an object through to SFP
            this.sfp.current.processBinLookupResponse({
                issuingCountryCode: binLookupResponse.issuingCountryCode,
                supportedBrands: [switchObj.leadBrand]
            });

            // 2) Single option found (binValueObject.supportedBrands.length === 1)
        } else {
            this.resetAdditionalSelectState(); // Reset UI

            // Set (single) value from binLookup so it will be added to the 'brand' property in the paymentMethod object
            // Call validateCardInput so this new value ends up in state for the Card UIElement (Card.tsx)
            this.setState({ additionalSelectValue: binLookupResponse.supportedBrands[0].brand }, this.validateCardInput);

            // Pass object through to SFP
            this.sfp.current.processBinLookupResponse({
                issuingCountryCode: binLookupResponse.issuingCountryCode,
                supportedBrands: binLookupResponse.supportedBrands
            });
        }
    }
}
