"use client";

import { useState } from 'react';

interface TeamSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onChangeNameClick: () => void;
    teamName: string;
}

export function TeamSettingsModal({
    isOpen,
    onClose,
    onChangeNameClick,
    teamName
}: TeamSettingsModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                <div className="p-6">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-gray-900">Team Settings</h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Current Team Info */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                        <div className="text-sm text-gray-600 mb-1">Current Team Name</div>
                        <div className="text-lg font-semibold text-gray-900">{teamName}</div>
                    </div>

                    {/* Settings Options */}
                    <div className="space-y-2">
                        {/* Change Team Name Option */}
                        <button
                            onClick={() => {
                                onClose();
                                onChangeNameClick();
                            }}
                            className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all group"
                        >
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </div>
                                <div className="text-left">
                                    <div className="font-medium text-gray-900">Change Team Name</div>
                                    <div className="text-sm text-gray-500">Update your team's display name</div>
                                </div>
                            </div>
                            <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>

                        {/* Placeholder for future settings */}
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg opacity-50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                        </svg>
                                    </div>
                                    <div className="text-left">
                                        <div className="font-medium text-gray-500">More Options</div>
                                        <div className="text-sm text-gray-400">Coming soon</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Close Button */}
                    <div className="mt-6">
                        <button
                            onClick={onClose}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}