import React, { useState } from 'react';

export default function ScheduleConfirmationModal({ suggestedAddOns, onClose, onConfirm }) {
  const [selected, setSelected] = useState([]);

  const handleToggle = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow max-w-md w-full">
        <h2 className="text-lg font-bold mb-4">Suggested Add-ons</h2>

        <ul className="space-y-2 mb-4">
          {suggestedAddOns.map(addOn => (
            <li key={addOn._id} className="flex items-center">
              <input
                type="checkbox"
                id={`addon-${addOn._id}`}
                checked={selected.includes(addOn._id)}
                onChange={() => handleToggle(addOn._id)}
                className="mr-2"
              />
              <label htmlFor={`addon-${addOn._id}`} className="cursor-pointer">
                {addOn.name} – ${addOn.price}
              </label>
            </li>
          ))}
        </ul>

        <div className="flex justify-end space-x-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded">Cancel</button>
          <button
            onClick={() => onConfirm(selected)}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            Add Selected
          </button>
        </div>
      </div>
    </div>
  );
}
