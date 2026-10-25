Certificates for tests only, made with openssl on 2026-10-26 and valid for a hundred years: a test authority
(`ca.pem`, its key thrown away), a certificate for `localhost` it signed (`gateway.pem`, `gateway.key`), and a
person's client certificate it signed (`person.pem`, `person.key`, and both in `person.pfx`, passphrase
`test-passphrase`). They secure nothing.
