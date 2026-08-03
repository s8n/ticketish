// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * Apple's Worldwide Developer Relations intermediate certificate, G4.
 *
 * Every pass signature has to carry this so Wallet can build a chain from the
 * signing certificate up to the Apple root it already trusts. It is a public
 * certificate, published at
 * https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer, and it is
 * bundled rather than fetched because a pass has to be signable offline.
 *
 * SHA-256 fingerprint:
 *   EA:47:57:88:55:38:DD:8C:B5:9F:F4:55:6F:67:60:87:D8:3C:85:E7:
 *   09:02:C1:22:E4:2C:08:08:B5:BC:E1:4C
 *
 * It expires on 10 December 2030. A pass signed after that will be refused,
 * so this file needs replacing before then with whichever intermediate Apple
 * has moved to; `passSigningProblem` in identity.ts is where that turns into
 * something a reader can act on rather than a silent failure.
 */

/** The certificate, DER encoded. */
export const WWDR_G4_BASE64 =
	'MIIEVTCCAz2gAwIBAgIUE9x3lVJx5T3GMujM/+Uh88zFztIwDQYJKoZIhvcNAQELBQAwYjELMAkG' +
	'A1UEBhMCVVMxEzARBgNVBAoTCkFwcGxlIEluYy4xJjAkBgNVBAsTHUFwcGxlIENlcnRpZmljYXRp' +
	'b24gQXV0aG9yaXR5MRYwFAYDVQQDEw1BcHBsZSBSb290IENBMB4XDTIwMTIxNjE5MzYwNFoXDTMw' +
	'MTIxMDAwMDAwMFowdTFEMEIGA1UEAww7QXBwbGUgV29ybGR3aWRlIERldmVsb3BlciBSZWxhdGlv' +
	'bnMgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkxCzAJBgNVBAsMAkc0MRMwEQYDVQQKDApBcHBsZSBJ' +
	'bmMuMQswCQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANAfeKp6JzKw' +
	'Rl/nF3bYoJ0OKY6tPTKlxGs3yeRBkWq3eXFdDDQEYHX3rkOPR8SGHgjov9Y5Ui8eZ/xx8YJtPH4G' +
	'UnadLLzVQ+mxtLxAOnhRXVGhJeG+bJGdayFZGEHVD41tQSo5SiHgkJ9OE0/QjJoyuNdqkh4laqQy' +
	'ziIZhQVg3AJK8lrrd3kCfcCXVGySjnYB5kaP5eYq+6KwrRitbTOFOCOL6oqW7Z+uZk+jDEAnbZXQ' +
	'YojZQykn/e2kv1MukBVlPNkuYmQzHWxq3Y4hqqRfFcYw7V/mjDaSlLfcOQIA+2SM1AyB8j/VNJeH' +
	'dSbCb64DYyEMe9QbsWLFApy9/a8CAwEAAaOB7zCB7DASBgNVHRMBAf8ECDAGAQH/AgEAMB8GA1Ud' +
	'IwQYMBaAFCvQaUeUdgn+9GuNLkCm90dNfwheMEQGCCsGAQUFBwEBBDgwNjA0BggrBgEFBQcwAYYo' +
	'aHR0cDovL29jc3AuYXBwbGUuY29tL29jc3AwMy1hcHBsZXJvb3RjYTAuBgNVHR8EJzAlMCOgIaAf' +
	'hh1odHRwOi8vY3JsLmFwcGxlLmNvbS9yb290LmNybDAdBgNVHQ4EFgQUW9n6HeeaGgujmXYiUIY+' +
	'kchbd6gwDgYDVR0PAQH/BAQDAgEGMBAGCiqGSIb3Y2QGAgEEAgUAMA0GCSqGSIb3DQEBCwUAA4IB' +
	'AQA/Vj2e5bbDeeZFIGi9v3OLLBKeAuOugCKMBB7DUshwgKj7zqew1UJEggOCTwb8O0kU+9h0UoWv' +
	'p50h5wESA5/NQFjQAde/MoMrU1goPO6cn1R2PWQnxn6NHThNLa6B5rmluJyJlPefx4elUWY0Gzlx' +
	'OSTjh2fvpbFoe4zuPfeutnvi0v/fYcZqdUmVIkSoBPyUuAsuORFJEtHlgepZAE9bPFo22noicwkJ' +
	'ac3AfOriJP6YRLj477JxPxpd1F1+M02cHSS+APCQA1iZQT0xWmJArzmoUUOSqwSonMJNsUvSq3xK' +
	'X+udO7xPiEAGE/+QF4oIRynoYpgppU8RBWk6z/Kf';

/** Latest date this certificate can still be part of a valid chain. */
export const WWDR_G4_EXPIRES = '2030-12-10';
