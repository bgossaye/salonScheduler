# Online family service limit

The public batch endpoint enforces a maximum of two services per client. The limit is grouped by clientId rather than applied to the total number of rows in a family batch. Two linked clients can therefore submit two services each (four rows total).

For each individual client, multiple services must remain on one date and with one stylist. Different linked clients may use different stylists, and individual scheduling mode may use different dates.
