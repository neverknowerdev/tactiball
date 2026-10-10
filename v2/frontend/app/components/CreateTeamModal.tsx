"use client";

import { useState, useEffect } from "react";
import countriesData from "../../public/countryList.json";

interface Country {
    index: number;
    name: string;
    code: string;
}

interface CreateTeamModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (teamName: string, countryIndex: string) => void;
    isLoading?: boolean;
    defaultTeamName?: string;
}

// Use imported countries data
const countries: Country[] = countriesData;

export function CreateTeamModal({ isOpen, onClose, onSubmit, isLoading = false, defaultTeamName }: CreateTeamModalProps) {
    const [teamName, setTeamName] = useState(defaultTeamName || "");
    const [selectedCountry, setSelectedCountry] = useState("");
    const [errors, setErrors] = useState<{ teamName?: string; country?: string }>({});

    // Reset form when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setTeamName(defaultTeamName || "");
            setSelectedCountry("");
            setErrors({});
        }
    }, [defaultTeamName]);

    const validateForm = () => {
        const newErrors: { teamName?: string; country?: string } = {};

        if (!teamName.trim()) {
            newErrors.teamName = "Team name is required";
        } else if (teamName.trim().length < 2) {
            newErrors.teamName = "Team name must be at least 2 characters";
        } else if (teamName.trim().length > 30) {
            newErrors.teamName = "Team name must be less than 30 characters";
        }

        if (!selectedCountry || selectedCountry === "" || parseInt(selectedCountry) <= 0) {
            newErrors.country = "Please select a country";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (validateForm()) {
            onSubmit(teamName.trim(), selectedCountry.toString());
        }
    };

    const handleClose = () => {
        if (!isLoading) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="modal relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">Create New Team</h2>
                    <button
                        onClick={handleClose}
                        disabled={isLoading}
                        className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Team Name Input */}
                    <div>
                        <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-2">
                            Team Name
                        </label>
                        <input
                            type="text"
                            id="teamName"
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            placeholder="Enter your team name"
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.teamName ? "border-red-300" : "border-gray-300"
                                }`}
                            disabled={isLoading}
                        />
                        {errors.teamName && (
                            <p className="mt-1 text-sm text-red-600">{errors.teamName}</p>
                        )}
                    </div>

                    {/* Country Selection */}
                    <div>
                        <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-2">
                            Country/League
                        </label>
                        <select
                            id="country"
                            value={selectedCountry}
                            onChange={(e) => setSelectedCountry(e.target.value)}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.country ? "border-red-300" : "border-gray-300"
                                }`}
                            disabled={isLoading}
                        >
                            <option value="">Select a country</option>
                            {countries.map((country) => (
                                <option key={country.index} value={country.index}>
                                    {country.name}
                                </option>
                            ))}
                        </select>
                        {errors.country && (
                            <p className="mt-1 text-sm text-red-600">{errors.country}</p>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isLoading}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {isLoading ? (
                                <div className="flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    Creating...
                                </div>
                            ) : (
                                "Create Team"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
