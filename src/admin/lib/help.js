// What each admin page is for and how to use it — the ⓘ beside every page
// title and panel. Keyed `tab` or `tab:subtab`; panels by their label.

export const PAGE_HELP = {
  'overview:stats': 'The shop at a glance. Every number is a button: tap Pending, Shipped, Delivered or Cancelled to open those orders. Revenue counts delivered orders only, because cash on delivery is only money once it arrives.',
  'overview:trend': 'Sales over time. Sales by month switches between pieces, orders and taka; Daily momentum shows the last two weeks day by day.',
  'overview:recent': 'Where orders came from: the link a customer clicked before buying (Instagram, Facebook, a tracked link from Marketing → Tracked links). Orders typed in from DMs show as their source.',

  'orders:list': 'Every order, newest first. Tap a card to open it: change its status (pending → shipped → delivered), call or WhatsApp the customer, send it to a courier or print a packing slip. Marking an order Delivered takes its pieces off stock and emails the customer. + New order is for orders taken over Instagram, Facebook or phone.',
  'orders:bkash': 'Outside-Dhaka orders pay the delivery charge by bKash first. Copy the TrxID from your bKash app, paste it here and press Verify: the matching order is marked paid and the customer gets their confirmation email.',
  'orders:abandoned': 'People who started checkout and typed a name or phone but never placed the order, with what was in their bag. Call or message them to help finish the order.',
  'orders:security': 'Order attempts the shop blocked because one connection tried to place too many orders too fast (more than 10 an hour). Real customers almost never show up here.',

  'products:catalog': 'All products. + Add product to upload a new one; tap a product to edit it. Drag a row by its handle to change the order of the Shop page (Shop all → Featured). Photos upload to Supabase Storage.',
  'products:stock': 'Pieces left in every size of every product, lowest first, so you know what to restock. Change counts inside the product.',
  'products:best': 'What sells most, by pieces sold (cancelled orders left out). To show products in the shop’s Best sellers row, tick Best seller in the product itself.',
  'products:drops': 'How each drop and each category sold: pieces and taka.',
  'products:margin': 'Price, cost and margin for every product that has a cost filled in. Cost is never shown to customers.',
  'products:collections': 'Drops (collections) like EID 2026: rename one, schedule its launch time for all its products at once, add products to it. Each drop gets a page in the shop menu and a lookbook.',

  'customers:repeat': 'Customers by phone number: how many ordered once and how many came back, and what each group spent. Regulars are the ones who ordered more than once.',
  'customers:reviews': 'Reviews customers left on product pages.',
  'customers:wishlist': 'Customers waiting for a sold-out size. Raising that size’s stock from 0 emails them automatically; Email them sends it again by hand.',

  'marketing:audience': 'Everyone who ordered or joined the email list, with what they spent. Copy the emails to use in an email tool or for Facebook/Instagram ads.',
  'marketing:adspend': 'Type in what you spent on each ad channel and what it brought in, to see return on ad spend (ROAS). Nothing is pulled from Facebook automatically.',
  'marketing:email': 'Type in each email campaign’s open and click rates to keep a record of what worked.',
  'marketing:social': 'Type in follower counts and engagement now and then to track growth.',
  'marketing:sales': 'A percentage off for a set time — the whole shop, one drop, or chosen products. The sale price, a “% off” tag and a countdown show on the shop and product pages, and checkout charges it. The biggest sale wins if two overlap.',
  'marketing:coupons': 'Discount codes customers type at checkout: % off or taka off, with an optional minimum order, limit and dates. Only switched-on codes work; a cancelled order gives the use back.',
  'marketing:links': 'Make a tracked link for a post, story or ad. When someone buys after clicking it, the order shows where it came from (Overview → Order sources).',

  analytics: 'Visitors to the shop: how many, from where, on which pages, at what times and from which districts, and how many went on to buy. Your own visits to /admin are not counted.',

  hero: 'The home page, top to bottom. MAIN HERO: full-screen photos or videos (wide for computers, tall for phones) with a SHOP NOW button that opens every product. DROP SECTIONS: under the hero, one banner per drop — photo, drop name, a line of text and SHOP NOW (opens only that drop’s products) — with a row of your best photos from the drop beneath it. Then the hero button, an optional drop countdown, and the ticker shown on every page but the home page.',
  lookbook: 'Photos for a drop’s lookbook page (/lookbook/drop-name). Upload a photo, pick its drop and tag the products worn in it: they are listed under the photo, and each tagged product shows the others under “Shop the look” on its own page.',
  menu: 'The ☰ side menu at the top left of the site, in two tabs. SHOP: the links shoppers browse by — All products, New arrivals, categories. EXPLORE: your drops, each opening only that drop’s products (a lookbook can go here too). Add a row with Goes to + the words to show; rename, re-point, reorder, hide or delete any row. An empty tab shows a default list.',
  about: 'The About page: blocks of one photo with a heading and text, top to bottom. Until you add one, the built-in About text shows.',

  'support:requests': 'Return and exchange requests customers sent from the Return & Exchange portal, plus ones you log by hand. Open one to approve an exchange (swaps the sizes in stock), refund (puts pieces back, records the money) or reject it.',
  'support:pages': 'The text of the Support pages (Return & refund, Exchange, Delivery, Size guide, Contact, Privacy, Terms). Edit and save; the site updates straight away.',
  'support:portal': 'The Return & Exchange portal page where customers look up their order (order number + phone or email) and ask for an exchange or refund. Set its heading, intro and photo here.',
}

export const PANEL_HELP = {
  'SALES BY MONTH': 'The last six months. Switch between pieces sold, number of orders and taka. Cancelled orders are left out.',
  'DAILY MOMENTUM': 'Orders and taka for each of the last 14 days.',
  'ORDERS BY SOURCE': 'Orders grouped by the link the customer came from (utm_source). Direct means no tracked link.',
  'ABANDONED CART': 'Checkouts started but not finished, most recent first. The phone number is a button to call.',
  'BLOCKED ORDER ATTEMPTS': 'Who a blocked order said they were and from which internet address.',
  'STOCK LEVELS': 'Every size of every counted product. Red is sold out, amber is low (3 or fewer).',
  'BEST SELLERS': 'Products ranked by pieces sold.',
  'COST & MARGIN': 'Margin = (price − cost) ÷ price. Fill in Cost inside a product to include it here.',
  'COLLECTED · NEW VS REPEAT': 'Money from delivered orders, split between first-time and returning customers.',
  'REGULARS': 'Customers with more than one order, most orders first.',
  'REVIEWS': 'Newest first.',
  'RESTOCK DEMAND': 'Sold-out sizes customers asked to be told about, busiest first.',
  'AD SPEND / ROAS': 'ROAS = revenue ÷ spend. Above 1 means the ads paid for themselves.',
  'EMAIL CAMPAIGNS': 'Open rate and click rate as percentages, from your email tool.',
  'SOCIAL TRACKING': 'A snapshot per platform each time you add a row.',
}

export function pageHelp(tab, sub) {
  return PAGE_HELP[sub ? `${tab}:${sub}` : tab] || PAGE_HELP[tab] || null
}
