import fetchJSONData from '../../utils/fetch-json-data';
import { CbObjOnBinLookup, CbObjOnBinValue, CbObjOnError } from '../internal/SecuredFields/lib/types';
import { DEFAULT_CARD_GROUP_TYPES } from '../internal/SecuredFields/lib/configuration/constants';
import { getError } from '../../core/Errors/utils';
import { ERROR_MSG_UNSUPPORTED_CARD_ENTERED } from '../../core/Errors/constants';
import { BinLookupResponse, BinLookupResponseObj } from './types';

export default function triggerBinLookUp(callbackObj: CbObjOnBinValue) {
    // Allow way for merchant to disallow binLookup by specifically setting the prop to false
    if (this.props.doBinLookup === false) {
        if (this.props.onBinValue) this.props.onBinValue(callbackObj);
        return;
    }

    // Do binLookup when encryptedBin property is present (and only if the merchant is using a clientKey)
    if (callbackObj.encryptedBin && this.props.clientKey) {
        // Store id of request we're about to make
        this.currentRequestId = callbackObj.uuid;

        fetchJSONData(
            {
                path: `v2/bin/binLookup?token=${this.props.clientKey}`,
                loadingContext: this.props.loadingContext,
                method: 'POST',
                contentType: 'application/json'
            },
            {
                supportedBrands: this.props.brands || DEFAULT_CARD_GROUP_TYPES,
                encryptedBin: callbackObj.encryptedBin,
                requestId: callbackObj.uuid // Pass id of request
            }
        ).then((data: BinLookupResponseObj) => {
            // If response is the one we were waiting for...
            if (data?.requestId === this.currentRequestId) {
                if (data.brands?.length) {
                    const mappedResponse = data.brands.reduce(
                        (acc, item) => {
                            acc.detectedBrands.push(item.brand);

                            if (item.supported === true) {
                                acc.supportedBrands.push(item);
                                return acc;
                            }

                            return acc;
                        },
                        { supportedBrands: [], detectedBrands: [] }
                    );

                    /**
                     * supportedBrands = merchant supports this brand(s); we have detected the card number to be of this brand(s); carry on!
                     */
                    if (mappedResponse.supportedBrands.length) {
                        // ...call processBinLookupResponse with, a simplified, response object if it contains at least one supported brand
                        this.processBinLookupResponse({
                            issuingCountryCode: data.issuingCountryCode,
                            supportedBrands: mappedResponse.supportedBrands
                        } as BinLookupResponse);

                        // Inform merchant of the result
                        this.props.onBinLookup({
                            type: callbackObj.type,
                            detectedBrands: mappedResponse.detectedBrands,
                            supportedBrands: mappedResponse.supportedBrands.map(item => item.brand), // supportedBrands contains the subset of this.props.brands that matches the card number that the shopper has typed
                            brands: this.props.brands || DEFAULT_CARD_GROUP_TYPES
                        } as CbObjOnBinLookup);

                        return;
                    }

                    /**
                     * detectedBrands = no brands the merchant supports were found; what we did detect the shopper to be entering was this brand; error!
                     */
                    if (mappedResponse.detectedBrands.length) {
                        const errObj: CbObjOnError = {
                            type: 'card',
                            fieldType: 'encryptedCardNumber',
                            error: getError(ERROR_MSG_UNSUPPORTED_CARD_ENTERED),
                            detectedBrands: mappedResponse.detectedBrands
                        };
                        this.handleUnsupportedCard(errObj);

                        // Inform merchant of the result
                        this.props.onBinLookup({
                            type: callbackObj.type,
                            detectedBrands: mappedResponse.detectedBrands,
                            supportedBrands: null,
                            brands: this.props.brands || DEFAULT_CARD_GROUP_TYPES
                        } as CbObjOnBinLookup);

                        return;
                    }
                } else {
                    /**
                     *  BIN not in DB (a failed lookup will just contain a requestId)
                     */
                    this.props.onBinLookup({
                        type: callbackObj.type,
                        detectedBrands: null,
                        supportedBrands: null,
                        brands: this.props.brands || DEFAULT_CARD_GROUP_TYPES
                    } as CbObjOnBinLookup);
                }
            } else {
                // Some other kind of error on the backend
                this.props.onError(data);
            }
        });
    } else if (this.currentRequestId) {
        // If onBinValue callback is called AND we have been doing binLookup BUT passed object doesn't have an encryptedBin property
        // - then the number of digits in number field has dropped below threshold for BIN lookup - so reset the UI
        this.processBinLookupResponse(null);

        this.currentRequestId = null; // Ignore any pending responses

        // Reset any errors
        const errObj: CbObjOnError = {
            type: 'card',
            fieldType: 'encryptedCardNumber',
            error: ''
        };
        this.handleUnsupportedCard(errObj);
    }

    if (this.props.onBinValue) this.props.onBinValue(callbackObj);
}
