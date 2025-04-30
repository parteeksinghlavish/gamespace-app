'use client';

import React, { useState, useEffect } from 'react';
import { api } from '~/trpc/react';

interface CommentEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: any;
  onSuccess: () => void;
}

export default function CommentEditModal({ isOpen, onClose, session, onSuccess }: CommentEditModalProps) {
  const [comments, setComments] = useState('');

  useEffect(() => {
    if (session) {
      setComments(session.comments || '');
    }
  }, [session]);

  const updateCommentsMutation = api.playerManagement.updateSessionComments.useMutation({
    onSuccess: () => {
      onSuccess();
      showToast('Comments updated', 'success');
    },
    onError: (error) => {
      showToast('Error updating comments: ' + error.message, 'error');
    },
  });

  // Simple toast notification
  const showToast = (message: string, type: 'success' | 'error') => {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 p-4 rounded-md text-white ${
      type === 'success' ? 'bg-green-500' : 'bg-red-500'
    } shadow-lg z-50`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('opacity-0', 'transition-opacity', 'duration-500');
      setTimeout(() => document.body.removeChild(toast), 500);
    }, 3000);
  };

  const handleSubmit = () => {
    if (!session) return;
    
    updateCommentsMutation.mutate({
      sessionId: session.id,
      comments: comments,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md mx-4 shadow-xl">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-medium">Edit Comments</h3>
          <button 
            className="text-gray-400 hover:text-gray-500"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        
        <div className="p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comments
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Add comments for this session"
              rows={4}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3">
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            onClick={handleSubmit}
            disabled={updateCommentsMutation.isPending}
          >
            {updateCommentsMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          <button
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
} 