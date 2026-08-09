import React, { useState, useRef } from 'react';
import API from '../../api';
import Input from '../ui/input';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { QRCodeCanvas } from 'qrcode.react';
import QRScanner from '../../utils/QRScanner';
import { Camera } from 'lucide-react';

const AdminGiftCards = () => {
    const [type, setType] = useState('physical');
    const [form, setForm] = useState({ amount: '', pin: '', email: '', code: '' });
    const [adminModal, setAdminModal] = useState(false);
    const [previewCode, setPreviewCode] = useState(null);
    const [redeem, setRedeem] = useState({ code: '', pin: '', redeemAmount: '' });
    const emailRef = useRef(null);
    const [allCards, setAllCards] = useState([]);
    const [viewMode, setViewMode] = useState('chooseMode');
    const qrRef = useRef();
    const [showScanner, setShowScanner] = useState(false);
const [popup, setPopup] = useState({
  open: false,
  title: '',
  message: '',
  doneLabel: 'Done',
  exitLabel: 'Exit',
  onDone: null,
  onExit: null,
});

const openPopup = ({
  title,
  message,
  doneLabel = 'Done',
  exitLabel = 'Exit',
  onDone,
  onExit,
}) => {
  setPopup({
    open: true,
    title,
    message,
    doneLabel,
    exitLabel,
    onDone,
    onExit,
  });
};

const closePopup = () =>
  setPopup(p => ({ ...p, open: false }));

    const generateCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 28; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    };

    const fetchAllGiftCards = async () => {
        try {
            const { data } = await API.get('/giftcards/all');
            setAllCards(data);
        } catch (err) {
            alert('Failed to fetch cards');
        }
    };

    const handlePreview = () => {
        // Force save autofilled email before modal opens
        const amount = Number(form.amount);
        if (isNaN(amount) || amount < 20 || amount > 300) {
            alert('Amount must be between $20 and $300.');
            return;
        }
        const filledEmail = document.querySelector('input[placeholder="Recipient Email (required)"]')?.value?.trim() || '';
        if (type === 'digital' && !filledEmail) {
            alert('Email is required for digital gift cards.');
            return;
        }
        setForm(prev => ({ ...prev, email: filledEmail }));
        setAdminModal(true);
    };

    const handleAdminAuth = () => {
        if (adminModal === 'viewAll') {
            setViewMode('viewAll');
            fetchAllGiftCards();
        }


        // reuse for preview as well
        if (adminModal === true || adminModal === 'preview') {
            if (type === 'digital') {
                const code = generateCode();
                setPreviewCode(code);
                setForm(prev => ({ ...prev, code: code }));
            } else if (type === 'physical') {
                handleCreate(); // directly save physical card
            }
        }

        setAdminModal(false);
    };


    const handleCreate = async () => {
        if (type === 'digital' && !form.email) {
            alert('Email is required for digital gift cards.');
            return;
        }

        if (type === 'physical' && !form.code) {
            alert('Code is required for physical gift cards.');
            return;
        }


        const amount = Number(form.amount);
        if (isNaN(amount) || amount < 20 || amount > 300) {
            alert('Amount must be between $20 and $300.');
            return;
        }

        const payload = { ...form, type };

        try {
            // Step 1: Create gift card in DB
            await API.post('/giftcards/create', payload);

            setTimeout(async () => {
                if (type === 'digital') {
                    const canvas = qrRef.current?.querySelector('canvas');
                    const qrData = canvas?.toDataURL();

                    if (!qrData) {
                        alert('QR code not generated. Please retry.');
                        await API.delete(`/giftcards/delete/${form.code}`);
                        console.log('✅ Card cleaned up from DB');
                        return;
                    }

                    try {
                        await API.post('/giftcards/send-email', {
                            email: form.email,
                            code: form.code,
                            amount: form.amount,
                            qrUrl: qrData,
                        });

                        alert('Gift card created and emailed successfully!');
                    } catch (emailErr) {
                        console.error('❌ Email failed:', emailErr);
                        alert('Gift card email failed. Card will be removed.');
                        await API.delete(`/giftcards/delete/${form.code}`);
                        return;
                    }
                } else {
                    openPopup({
                      title: 'Gift card created',
                      message: `Gift card successfully created for                 $${Number(form.amount).toFixed(2)} value.`,
                      onDone: () => handleExit(), // back to gift card main
                      onExit: () =>                      window.location.assign('/booking/admin/appointments'),
                       });
                }

                setForm({ amount: '', pin: '', email: '', code: '' });
                setPreviewCode(null);
                setViewMode('chooseMode');
            }, 500);


       } catch (err) {
    console.error('❌ Failed to create card in DB:', err);

    const msg = err?.response?.data?.message || '';
    const status = err?.response?.status;

    // If card already exists in DB
    if (
        status === 409 ||
        msg.toLowerCase().includes('exists') ||
        msg.toLowerCase().includes('duplicate')
    ) {
        alert(
            'This gift card code is already in the system.\n\n' +
            'Try redeeming it instead of loading a new one.'
        );
    } else {
        alert(msg || 'Gift card creation failed. Please try again.');
    }
}

        console.log('✅ giftcard sent');

    };


    const handleRedeemSearch = async (code = redeem.code) => {
    try {
        const res = await API.get(`/giftcards/redeem-search/${code}`);
        if (!res.data || !res.data.card) {
            alert(
                'Gift card not found in the system.\n\n' +
                'Make sure you scanned/typed the correct code or load a new card first.'
            );
            return;
        }
        const foundCard = res.data.card;

        setRedeem(prev => ({
            ...prev,
            code: foundCard.code,
            balance: foundCard.remainingBalance,
            pin: '',
            redeemAmount: ''
        }));
    } catch (err) {
        const status = err?.response?.status;
        const msg = err?.response?.data?.message || '';

        if (status === 404 || msg.toLowerCase().includes('not found')) {
            alert(
                'Gift card not found in the system.\n\n' +
                'Check the code or load a new card before redeeming.'
            );
        } else {
            alert(msg || 'Could not look up this gift card. Please try again.');
        }
    }
};




    const handleExit = () => {
        // Clear fields
        setForm({ amount: '', pin: '', email: '', code: '' });
        setRedeem({ code: '', pin: '', redeemAmount: '', balance: undefined });
        setPreviewCode(null)

        setViewMode('chooseMode');
    };
    return (
        <Card className="p-4 max-w-xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">Gift Card Center</h2>


            <div className="flex flex-col sm:flex-row gap-2 w-full">

            </div>

            {viewMode === 'chooseMode' && (
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <Button className="w-full sm:w-auto" onClick={() => { setViewMode('load'); setType('physical'); }}>
                            Load
                        </Button>
                        <Button className="w-full sm:w-auto" onClick={() => setViewMode('redeem')}>
                            Redeem
                        </Button>
                        <Button className="w-full sm:w-auto" onClick={() => setAdminModal('viewAll')}>
                            Show All
                        </Button>
                    </div>
                </div>
            )}
            {viewMode === 'viewAll' && (
                <div className="mt-6 space-y-4">

                    <h3 className="text-xl font-semibold mb-2">All Gift Cards</h3>
<Button
    className="mt-2 bg-gray-200 text-black hover:bg-gray-300"
    onClick={handleExit}
>
    Cancel
</Button>

                    {allCards.length === 0 ? (
                        <p>No cards found.</p>
                    ) : (
                        allCards.map(card => (
                            <div key={card.code} className="border p-3 rounded flex justify-between items-center">
                                <div>
                                    <p><strong>Code:</strong> {card.code}</p>
                                    <p><strong>Type:</strong> {card.type}</p>
                                    <p><strong>Balance:</strong> ${card.remainingBalance}</p>
                                    <p><strong>Email:</strong> {card.email || 'N/A'}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            const newAmount = prompt("Enter new amount:", card.remainingBalance);
                                            if (newAmount) {
                                                API.put(`/giftcards/update/${card.code}`, { amount: newAmount })
                                                    .then(() => fetchAllGiftCards())
                                                    .catch(() => alert('Failed to update.'));
                                            }
                                        }}
                                    >
                                        ✏️
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={() => {
                                            if (window.confirm('Delete this card?')) {
                                                API.delete(`/giftcards/delete/${card.code}`)
                                                    .then(() => fetchAllGiftCards())
                                                    .catch(() => alert('Failed to delete.'));
                                            }
                                        }}
                                    >
                                        🗑
                                    </Button>
                                </div>

                            </div>
                        ))
                    )}
                </div>
            )}

            {viewMode === 'load' && (
                <div className="space-y-2">
                    <div className="flex gap-4 items-center">
                        <label>
                            <input type="radio" name="cardType" value="physical" checked={type === 'physical'} onChange={() => setType('physical')} /> Physical
                        </label>
                        <label>
                            <input type="radio" name="cardType" value="digital" checked={type === 'digital'} onChange={() => setType('digital')} /> Digital
                        </label>
                    </div>
                    {type === 'physical' && (
                        <div className="flex flex-col gap-2">
                            <Input
                                placeholder="Type, scan, or use scanQR bellow "
                                value={form.code}
                                onChange={e => setForm({ ...form, code: e.target.value })}
                            />
                            <div className="flex gap-2">
                                <Button
                                    onClick={() => setShowScanner(true)}
                                    variant="outline"

                                    className="flex items-center gap-2 text-black !text-black"
                                >
                                    <Camera size={18} />
                                    <span className="!text-black">Scan QR</span>
                                </Button>
                                <p className="text-sm text-gray-500 italic">
                                    You can type the code, use a USB scanner, or tap Scan QR
                                </p>
                            </div>
                        </div>
                    )}

                    <Input
                        placeholder="Amount"
                        type="number"
                        value={form.amount}
                        onChange={e => {
                            const raw = e.target.value;
                            // Allow empty or numeric input only
                            if (raw === '' || /^[0-9]+$/.test(raw)) {
                                setForm({ ...form, amount: raw });
                            }
                        }}
                    />


<Input
    placeholder="PIN (optional)"
    value={form.pin}
    onChange={e => setForm({ ...form, pin: e.target.value })}
    autoComplete="new-password"     // prevents save prompt
    inputMode="numeric"             // optional: number keypad on mobile
    type="text"                     // IMPORTANT: do NOT use type="password"
    name="no-pin-save"              // name trick to fool password managers
/>

                    {type === 'digital' && (
                        <input
                            type="email"
                            placeholder="Recipient Email (required)"
                            ref={emailRef}
                            className="border rounded px-2 py-1 w-full"
                            autoComplete="email"
                            value={form.email}
                            onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                        />
                    )}
<Button onClick={handlePreview}>
  {type === 'physical' ? 'Submit' : 'Review'}
</Button>
<Button
    className="mt-2 bg-gray-200 text-black hover:bg-gray-300"
    onClick={handleExit}
>
    Cancel
</Button>

                    </div>
            )}

            {adminModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded shadow max-w-sm w-full">
                        <h3 className="text-lg font-semibold mb-2">Confirm gift card action</h3>
                        <p className="mb-4 text-sm text-gray-600">Your signed-in staff account and Gift Card permission authorize this action.</p>
                        <div className="flex justify-end gap-2">
                            <Button onClick={handleAdminAuth}>Continue</Button>
                            <button onClick={() => setAdminModal(false)} > Cancel  </button>
                        </div>
                    </div>
                </div>
            )}

            {previewCode && (
                <div className="text-center mt-4">
                    <div ref={qrRef}>
                        <QRCodeCanvas value={form.code || 'default'} size={150} />
                    </div>

                    <div className="mt-2 flex justify-center gap-2">
                        <Button onClick={handleCreate}>Accept & Save</Button>
                        <Button onClick={() => setPreviewCode(null)}>Cancel</Button>
                    </div>
                </div>
            )}

            {viewMode === 'redeem' && (
                <div className="space-y-4">
                    <p className="text-gray-600 italic">Please scan a gift card to Redeem</p>
                    <Input
                        placeholder="Gift Card Code"
                        value={redeem.code}
                        onChange={(e) => {
                            const value = e.target.value.trim();
                            if (value.length <= 28) {
                                setRedeem(prev => ({ ...prev, code: value }));
                            }
                        }}
                        onPaste={async (e) => {
                            e.preventDefault();
                            const pasted = e.clipboardData.getData('text').trim();
                            if (pasted.length === 28) {
                                setRedeem(prev => ({ ...prev, code: pasted }));
                                await handleRedeemSearch(pasted);
                            } else {
                                alert('Invalid gift card code length.');
                            }
                        }}
                        onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (redeem.code.length === 28) {
                                    await handleRedeemSearch(redeem.code);
                                } else {
                                    alert('Code must be 28 characters long.');
                                }
                            }
                        }}
                    />
                    <Button
                        onClick={() => setShowScanner(true)}
                        variant="outline"
                        className="flex items-center gap-2 text-black !text-black"
                    >
                        <Camera size={18} />
                        <span className="!text-black">Scan QR</span>
                    </Button>

<Button
    className="mt-2 bg-gray-200 text-black hover:bg-gray-300"
    onClick={handleExit}
>
    Cancel
</Button>

                    {redeem.balance !== undefined && (
                        <div className="space-y-2">
                            <p className="text-sm text-gray-700">
                                Current Balance: <span className="font-bold">${redeem.balance}</span>
                            </p>
                            <Input
                                placeholder="Redeem Amount"
                                value={redeem.redeemAmount}
                                onChange={e => setRedeem({ ...redeem, redeemAmount: e.target.value })}
                            />
                            <Input
    placeholder="PIN (if required)"
    value={redeem.pin}
    onChange={e => setRedeem({ ...redeem, pin: e.target.value })}
    autoComplete="new-password"
    inputMode="numeric"
    type="text"
    name="redeem-no-pin-save"
/>


                            {redeem.redeemAmount && (
                                <p className={`text-sm font-bold ${Number(redeem.balance) - Number(redeem.redeemAmount) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                    Remaining after redeem: ${Number(redeem.balance) - Number(redeem.redeemAmount)}
                                </p>
                            )}

                            <Button onClick={() => {
                                const redeemTotal = Number(redeem.redeemAmount);
                                const cardBalance = Number(redeem.balance);

                                if (!redeem.code || redeemTotal <= 0 || isNaN(redeemTotal)) {
                                    alert('Please enter a valid amount.');
                                    return;
                                }

                                if (cardBalance <= 0) {
                                    alert('Card has no remaining balance.');
                                    return;
                                }

                                const amountToRedeem = Math.min(cardBalance, redeemTotal);

                                const payload = {
                                    code: redeem.code,
                                    pin: redeem.pin,
                                    redeemAmount: amountToRedeem
                                };

                                API.post('/giftcards/redeem', payload)
                                    .then(res => {
                                        const remainingDue = redeemTotal - amountToRedeem;
                                        if (remainingDue > 0) {
                                            alert(`NOT enough. Receive $${remainingDue.toFixed(2)} from the customer`);
                                        } else {
openPopup({
  title: 'Redeemed',
  message: `Gift card balance after use is $${Number(res.data.remaining).toFixed(2)}.`,
  onDone: () => handleExit(),
  onExit: () => window.location.assign('/booking/admin/appointments'),
});
                                        }

                                        setRedeem({ code: '', pin: '', redeemAmount: '', balance: undefined });
                                    })
                                        .catch(err => {
        const status = err?.response?.status;
        const msg = err?.response?.data?.message || '';

        if (status === 404 || msg.toLowerCase().includes('not found')) {
            alert(
                'This gift card is not in the system.\n\n' +
                'Confirm the code, or load a new gift card before redeeming.'
            );
        } else {
            alert(msg || 'Redemption error. Please try again.');
        }
    });

                            }}>
                                Redeem
                            </Button>

                        </div>
                    )}
                </div>
            )}

{popup.open && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 text-center">
      <h3 className="text-lg font-semibold mb-2">{popup.title}</h3>
      <p className="text-sm text-gray-700 mb-5">{popup.message}</p>

      <div className="flex gap-2">
        <button
          className="flex-1 bg-blue-600 text-white py-2 rounded"
          onClick={() => {
            popup.onDone?.();
            closePopup();
          }}
        >
          {popup.doneLabel}
        </button>

        <button
          className="flex-1 border py-2 rounded"
          onClick={() => {
            popup.onExit?.();
            closePopup();
          }}
        >
          {popup.exitLabel}
        </button>
      </div>
    </div>
  </div>
)}



            {
                showScanner && (
                    <QRScanner
                        onScanComplete={(code) => {
                            if (viewMode === 'redeem') {
                                setRedeem(prev => ({ ...prev, code }));
                                handleRedeemSearch(code);
                            } else if (viewMode === 'load' && type === 'physical') {
                                setForm(prev => ({ ...prev, code }));
                            }
                            setShowScanner(false);
                        }}

                        onCancel={() => setShowScanner(false)} 
                    />
                )
            }
        </Card>
    );
};

export default AdminGiftCards;
